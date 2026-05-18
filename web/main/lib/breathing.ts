import { findPSDPeak, welchPSD } from "./breathing/fft.ts";
import {
	buildPyramid,
	detectShiTomasi,
	type Feature,
	type PyramidLevel,
	updateFeatures,
} from "./breathing/lk.ts";
import {
	computeQuality,
	detectExposureJump,
	type QualityScore,
} from "./breathing/quality.ts";
import {
	analyzeIBI,
	bandpass,
	detrend,
	findPeaks,
	hampelFilter,
	stddev,
} from "./breathing/signal.ts";

export const SAMPLE_RATE_HZ = 30;
export const BUFFER_SECONDS = 20;
export const BPM_MIN = 5;
export const BPM_MAX = 80;

const PYRAMID_LEVELS = 2;
const TARGET_FEATURES = 30;
const REDETECT_MIN_FEATURES = 12;
const HAMPEL_WINDOW = 7;
const MIN_ESTIMATE_SECONDS = 6;
const BANDPASS_LOW_HZ = 0.08;
const BANDPASS_HIGH_HZ = 1.5;
const PEAK_PROMINENCE_SD = 0.5;
const MIN_BREATH_SEP_S = 0.5;
const SHAKE_RATIO = 4;
const SHAKE_WARN_FRACTION = 0.3;
const SHAKE_WARMUP_S = 1;
const ROI_MAG_EMA_ALPHA = 0.05;
const RECENT_LUMA_WINDOW = 8;
const EXPOSURE_COOLDOWN_S = 2;

export type SignalChannel = "lk" | "edge" | "diff";

export type BreathingEstimate = {
	bpm: number | null;
	bpmSd: number | null;
	regularityCV: number | null;
	cycleCount: number;
	quality: QualityScore;
	samplesReady: number;
	bufferSeconds: number;
	shakeRecent: boolean;
	exposureJumpRecent: boolean;
	activeSignal: SignalChannel | null;
	aliveFeatures: number;
	breathOffsets: number[];
};

export type BreathingFrame = {
	roiRgba: Uint8ClampedArray;
	roiWidth: number;
	roiHeight: number;
	globalDiff: number;
	globalMeanLuma: number;
};

export type BreathingEstimator = {
	feed(frame: BreathingFrame): void;
	estimate(): BreathingEstimate;
	reset(): void;
	getWaveform(): Float32Array;
	getFeatures(): Feature[];
};

export function createBreathingEstimator(
	options: { sampleRateHz?: number; bufferSeconds?: number } = {},
): BreathingEstimator {
	const fs = options.sampleRateHz ?? SAMPLE_RATE_HZ;
	const seconds = options.bufferSeconds ?? BUFFER_SECONDS;
	const capacity = Math.round(fs * seconds);
	const shakeWindow = Math.round(fs * 2);
	const shakeWarmup = Math.round(fs * SHAKE_WARMUP_S);
	const exposureCooldown = Math.round(fs * EXPOSURE_COOLDOWN_S);

	const lkBuf = new Float32Array(capacity);
	const edgeBuf = new Float32Array(capacity);
	const diffBuf = new Float32Array(capacity);
	let writeIdx = 0;
	let count = 0;

	let roiW = 0;
	let roiH = 0;
	let lumaA: Uint8Array | null = null;
	let lumaB: Uint8Array | null = null;
	let scratch: Uint8Array | null = null;
	let prevPyramid: PyramidLevel[] | null = null;
	let features: Feature[] = [];
	let frameIdx = 0;
	let lkCumulative = 0;

	const shakeFlags: boolean[] = [];
	let roiMagEma = 0;
	const recentMeanLuma: number[] = [];
	let lastExposureFrame = -Infinity;

	let lastActive: SignalChannel | null = null;
	let lastBreathOffsets: number[] = [];

	function ensureBuffers(w: number, h: number) {
		if (w === roiW && h === roiH && lumaA && lumaB && scratch) return;
		roiW = w;
		roiH = h;
		lumaA = new Uint8Array(w * h);
		lumaB = new Uint8Array(w * h);
		scratch = new Uint8Array(w * h);
		prevPyramid = null;
		features = [];
		frameIdx = 0;
		lkCumulative = 0;
	}

	function snapshot(buf: Float32Array): Float32Array {
		const n = Math.min(count, capacity);
		const out = new Float32Array(n);
		const start = count < capacity ? 0 : writeIdx;
		for (let i = 0; i < n; i++) out[i] = buf[(start + i) % capacity];
		return out;
	}

	function pushSample(lkSig: number, edgeSig: number, diffSig: number) {
		lkBuf[writeIdx] = lkSig;
		edgeBuf[writeIdx] = edgeSig;
		diffBuf[writeIdx] = diffSig;
		writeIdx = (writeIdx + 1) % capacity;
		count++;
	}

	function estimateChannel(buf: Float32Array): {
		bpmSpec: number | null;
		snr: number;
		peakNormalized: number;
		filteredForPeaks: Float32Array | null;
	} {
		if (buf.length < fs * MIN_ESTIMATE_SECONDS) {
			return {
				bpmSpec: null,
				snr: 0,
				peakNormalized: 0,
				filteredForPeaks: null,
			};
		}
		const cleaned = hampelFilter(buf, HAMPEL_WINDOW, 3);
		const detrended = detrend(cleaned);
		const bp = bandpass(detrended, fs, BANDPASS_LOW_HZ, BANDPASS_HIGH_HZ);
		const { freq, psd } = welchPSD(bp, fs, {
			segmentLength: 256,
			overlap: 0.5,
		});
		const peak = findPSDPeak(freq, psd, BPM_MIN / 60, BPM_MAX / 60);
		if (!peak) {
			return { bpmSpec: null, snr: 0, peakNormalized: 0, filteredForPeaks: bp };
		}
		const bpmSpec = peak.freq * 60;
		const peakNorm = peak.bandPower > 0 ? peak.power / peak.bandPower : 0;
		return {
			bpmSpec,
			snr: peak.snr,
			peakNormalized: peakNorm,
			filteredForPeaks: bp,
		};
	}

	return {
		feed(frame: BreathingFrame) {
			ensureBuffers(frame.roiWidth, frame.roiHeight);
			if (!lumaA || !lumaB || !scratch) return;

			const currBuf = frameIdx % 2 === 0 ? lumaA : lumaB;
			const prevBuf = frameIdx % 2 === 0 ? lumaB : lumaA;
			const N = roiW * roiH;

			// Grayscale conversion.
			for (let i = 0, j = 0; j < N; i += 4, j++) {
				currBuf[j] =
					(frame.roiRgba[i] * 76 +
						frame.roiRgba[i + 1] * 150 +
						frame.roiRgba[i + 2] * 29) >>
					8;
			}
			// 3x3 box blur to denoise sensor grain.
			boxBlur3x3(currBuf, roiW, roiH, scratch);

			// Haar vertical-difference signal.
			let topSum = 0;
			let botSum = 0;
			const halfH = roiH >> 1;
			for (let y = 0; y < halfH; y++) {
				const row = y * roiW;
				for (let x = 0; x < roiW; x++) topSum += currBuf[row + x];
			}
			for (let y = halfH; y < roiH; y++) {
				const row = y * roiW;
				for (let x = 0; x < roiW; x++) botSum += currBuf[row + x];
			}
			const edgeSig = (topSum - botSum) / (roiW * halfH);

			// Frame-diff signal (vs previous luma).
			let diffSig = 0;
			if (frameIdx > 0) {
				let sum = 0;
				for (let i = 0; i < N; i++) sum += Math.abs(currBuf[i] - prevBuf[i]);
				diffSig = sum / N;
			}

			// Pyramidal Lucas–Kanade for sub-pixel feature tracking.
			const currPyramid = buildPyramid(currBuf, roiW, roiH, PYRAMID_LEVELS);
			let lkDy = 0;
			let aliveCount = 0;
			if (prevPyramid && features.length > 0) {
				const upd = updateFeatures(features, prevPyramid, currPyramid);
				lkDy = upd.medianDy;
				aliveCount = upd.aliveCount;
				if (aliveCount < REDETECT_MIN_FEATURES) {
					features = detectShiTomasi(currBuf, roiW, roiH, TARGET_FEATURES);
				}
			} else {
				features = detectShiTomasi(currBuf, roiW, roiH, TARGET_FEATURES);
			}
			prevPyramid = currPyramid;
			lkCumulative += lkDy;

			// Shake gate based on global frame motion vs ROI baseline.
			const roiMag = Math.abs(edgeSig) + Math.abs(diffSig) + Math.abs(lkDy);
			const isWarmup = frameIdx < shakeWarmup;
			if (!isWarmup) {
				const baseline = Math.max(roiMagEma, 1e-6);
				const isShake = frame.globalDiff > SHAKE_RATIO * baseline;
				shakeFlags.push(isShake);
				if (shakeFlags.length > shakeWindow) shakeFlags.shift();
				if (isShake) {
					frameIdx++;
					return;
				}
			}

			// Exposure-jump detection.
			if (detectExposureJump(recentMeanLuma, frame.globalMeanLuma)) {
				lastExposureFrame = frameIdx;
			}
			recentMeanLuma.push(frame.globalMeanLuma);
			if (recentMeanLuma.length > RECENT_LUMA_WINDOW) recentMeanLuma.shift();

			if (frameIdx >= shakeWarmup) {
				roiMagEma =
					(1 - ROI_MAG_EMA_ALPHA) * roiMagEma + ROI_MAG_EMA_ALPHA * roiMag;
			} else {
				roiMagEma = roiMagEma === 0 ? roiMag : 0.7 * roiMagEma + 0.3 * roiMag;
			}

			pushSample(lkCumulative, edgeSig, diffSig);
			frameIdx++;
		},

		reset() {
			writeIdx = 0;
			count = 0;
			roiW = 0;
			roiH = 0;
			lumaA = null;
			lumaB = null;
			scratch = null;
			prevPyramid = null;
			features = [];
			frameIdx = 0;
			lkCumulative = 0;
			shakeFlags.length = 0;
			roiMagEma = 0;
			recentMeanLuma.length = 0;
			lastExposureFrame = -Infinity;
			lastActive = null;
			lastBreathOffsets = [];
		},

		getWaveform() {
			if (lastActive === "lk") return snapshot(lkBuf);
			if (lastActive === "edge") return snapshot(edgeBuf);
			if (lastActive === "diff") return snapshot(diffBuf);
			// No estimate yet — default to LK if any features tracked, else diff.
			return snapshot(features.length > 0 ? lkBuf : diffBuf);
		},

		getFeatures() {
			return features;
		},

		estimate() {
			const samplesReady = Math.min(count, capacity);
			const bufferSeconds = samplesReady / fs;
			const dropCount = shakeFlags.filter(Boolean).length;
			const shakeRecent =
				shakeFlags.length >= fs &&
				dropCount / shakeFlags.length >= SHAKE_WARN_FRACTION;
			const exposureJumpRecent =
				frameIdx - lastExposureFrame < exposureCooldown;

			const emptyQuality: QualityScore = {
				total: 0,
				breakdown: {
					spectral: 0,
					peakSharpness: 0,
					regularity: 0,
					featureHealth: 0,
					shakePenalty: 0,
					exposurePenalty: 0,
				},
			};

			if (bufferSeconds < MIN_ESTIMATE_SECONDS) {
				return {
					bpm: null,
					bpmSd: null,
					regularityCV: null,
					cycleCount: 0,
					quality: emptyQuality,
					samplesReady,
					bufferSeconds,
					shakeRecent,
					exposureJumpRecent,
					activeSignal: null,
					aliveFeatures: features.filter((f) => f.alive).length,
					breathOffsets: [],
				};
			}

			const channels: Array<{
				name: SignalChannel;
				buf: Float32Array;
			}> = [
				{ name: "lk", buf: snapshot(lkBuf) },
				{ name: "edge", buf: snapshot(edgeBuf) },
				{ name: "diff", buf: snapshot(diffBuf) },
			];

			let best: {
				name: SignalChannel;
				bpmSpec: number;
				snr: number;
				peakNormalized: number;
				filteredForPeaks: Float32Array;
			} | null = null;

			for (const ch of channels) {
				const res = estimateChannel(ch.buf);
				if (res.bpmSpec == null || !res.filteredForPeaks) continue;
				if (!best || res.snr > best.snr) {
					best = {
						name: ch.name,
						bpmSpec: res.bpmSpec,
						snr: res.snr,
						peakNormalized: res.peakNormalized,
						filteredForPeaks: res.filteredForPeaks,
					};
				}
			}

			if (!best) {
				lastActive = null;
				lastBreathOffsets = [];
				const quality = computeQuality({
					spectralSnr: 0,
					spectralPeakNormalized: 0,
					regularityCV: null,
					aliveFeatures: features.filter((f) => f.alive).length,
					targetFeatures: TARGET_FEATURES,
					shakeFraction:
						shakeFlags.length > 0 ? dropCount / shakeFlags.length : 0,
					exposureJumpRecent,
					cycleCount: 0,
				});
				return {
					bpm: null,
					bpmSd: null,
					regularityCV: null,
					cycleCount: 0,
					quality,
					samplesReady,
					bufferSeconds,
					shakeRecent,
					exposureJumpRecent,
					activeSignal: null,
					aliveFeatures: features.filter((f) => f.alive).length,
					breathOffsets: [],
				};
			}

			lastActive = best.name;

			// Peak detection on the chosen filtered signal.
			const sd = stddev(best.filteredForPeaks);
			const minSep = Math.round(MIN_BREATH_SEP_S * fs);
			const peakIndices = findPeaks(
				best.filteredForPeaks,
				minSep,
				sd * PEAK_PROMINENCE_SD,
			);
			lastBreathOffsets = peakIndices;
			const ibi = analyzeIBI(peakIndices, fs);

			// Blend spectral and IBI BPM. Prefer IBI when we have ≥3 cycles AND
			// the two agree within 6 BPM (otherwise the spectral estimate is the
			// more reliable baseline).
			let bpm = best.bpmSpec;
			const bpmSd = ibi.sdBpm;
			if (
				ibi.meanBpm != null &&
				ibi.cycleCount >= 3 &&
				Math.abs(ibi.meanBpm - best.bpmSpec) < 6
			) {
				bpm = 0.5 * ibi.meanBpm + 0.5 * best.bpmSpec;
			}

			const aliveFeatures = features.filter((f) => f.alive).length;
			const quality = computeQuality({
				spectralSnr: best.snr,
				spectralPeakNormalized: best.peakNormalized,
				regularityCV: ibi.regularityCV,
				aliveFeatures,
				targetFeatures: TARGET_FEATURES,
				shakeFraction:
					shakeFlags.length > 0 ? dropCount / shakeFlags.length : 0,
				exposureJumpRecent,
				cycleCount: ibi.cycleCount,
			});

			return {
				bpm,
				bpmSd,
				regularityCV: ibi.regularityCV,
				cycleCount: ibi.cycleCount,
				quality,
				samplesReady,
				bufferSeconds,
				shakeRecent,
				exposureJumpRecent,
				activeSignal: best.name,
				aliveFeatures,
				breathOffsets: lastBreathOffsets.slice(),
			};
		},
	};
}

function boxBlur3x3(
	buf: Uint8Array,
	w: number,
	h: number,
	scratch: Uint8Array,
) {
	for (let y = 0; y < h; y++) {
		const yU = y === 0 ? 0 : y - 1;
		const yD = y === h - 1 ? h - 1 : y + 1;
		for (let x = 0; x < w; x++) {
			const xL = x === 0 ? 0 : x - 1;
			const xR = x === w - 1 ? w - 1 : x + 1;
			const sum =
				buf[yU * w + xL] +
				buf[yU * w + x] +
				buf[yU * w + xR] +
				buf[y * w + xL] +
				buf[y * w + x] +
				buf[y * w + xR] +
				buf[yD * w + xL] +
				buf[yD * w + x] +
				buf[yD * w + xR];
			scratch[y * w + x] = (sum / 9) | 0;
		}
	}
	buf.set(scratch);
}
