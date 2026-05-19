import {
	type BlockMatcher,
	createBlockMatcher,
} from "./breathing/block-match.ts";
import { findPSDPeak, welchPSD } from "./breathing/fft.ts";
import {
	computeQuality,
	detectExposureJump,
	type QualityScore,
} from "./breathing/quality.ts";
import {
	analyzeIBI,
	bandpass,
	detrend,
	findCycles,
	hampelFilter,
	stddev,
} from "./breathing/signal.ts";
import {
	type BpmTracker,
	bpmMeasurementVariance,
	createBpmTracker,
} from "./breathing/tracker.ts";

export const SAMPLE_RATE_HZ = 30;
export const BUFFER_SECONDS = 20;
// 12 BPM is below the at-rest range for healthy dogs of any size, so the
// lower bound here also defines the bandpass cutoff that excludes the
// 5-10 BPM band where slow template-drift artifacts live. Upper bound
// has to comfortably cover stressed/panting small dogs, which can hit
// 120 BPM — leave a margin so the spectral peak isn't clipped near
// the search edge.
export const BPM_MIN = 12;
export const BPM_MAX = 140;

const HAMPEL_WINDOW = 7;
const MIN_ESTIMATE_SECONDS = 6;
// Wide bandpass applied to the position signal before BOTH spectral
// analysis and cycle counting. Low cutoff well above template-drift
// time constant; high cutoff well above the fastest expected breathing
// frequency (so the 4th-order Butterworth's transition band doesn't
// attenuate 120 BPM signals).
const BANDPASS_LOW_HZ = 0.2;
const BANDPASS_HIGH_HZ = 2.6;
const ADAPTIVE_BANDPASS_HALF_WIDTH_HZ = 0.25;
// Cycle detector's minimum inter-crossing separation. 0.3s → can count
// up to 200 BPM correctly; smaller than that risks counting noise
// flicker as separate cycles.
const MIN_BREATH_SEP_S = 0.3;
const ZERO_CROSSING_HYSTERESIS_FRACTION = 0.15;
const RECENT_LUMA_WINDOW = 12;
const EXPOSURE_COOLDOWN_S = 2;
const MIN_NCC_CONFIDENCE = 0.2;
const MIN_MEASUREMENT_SNR = 2;
const HOLD_QUALITY_THRESHOLD = 50;
const LOCK_VARIANCE = 9;
const LOCK_FRAMES = 4;
// Template-relative dy at typical phone framing stays within a few pixels
// even for vigorous breathing. Anything beyond this is body motion: the
// median across sub-regions already absorbs localized motion, so this
// catches the case where the whole ROI moves at once.
const MAX_FRAME_DY_PX = 4;
const MOTION_WINDOW_S = 2;
const MOTION_HOLD_FRACTION = 0.2;
// 3 × 2 grid → 6 independent row-projection measurements per frame.
// Median rejects regions affected by partial motion / shadows /
// occlusion. Choosing 6 keeps a quorum of ≥4 working even with 2 bad
// regions and stays cheap.
const SUB_REGION_COLS = 3;
const SUB_REGION_ROWS = 2;
const NUM_SUB_REGIONS = SUB_REGION_COLS * SUB_REGION_ROWS;
// Need at least this many sub-regions agreeing this frame for a valid
// measurement. Below this the median is meaningless and we hold position.
const MIN_VALID_SUB_REGIONS = 3;
// History of per-region dy used by the debug overlay to render
// per-cell motion amplitude. ~2 s window at 30 Hz.
const SUB_REGION_DEBUG_HISTORY = 60;
// 3-frame moving average on the per-frame median dy. Kills the high-
// frequency jaggedness that doesn't represent breathing (which is
// always <2 Hz). Smooths just over 100 ms — way below the fastest
// plausible breathing period.
const DY_SMOOTHING_WINDOW = 3;
// Spectral peak and time-domain IBI must agree within this factor before
// the tracker accepts a measurement. Prevents the algorithm from locking
// onto a spurious low-frequency peak while the bandpassed signal has
// dozens of noise-driven zero-crossings (the v5 "7 BPM with 75 cycles"
// failure mode).
const SPECTRAL_IBI_AGREEMENT_RATIO = 1.6;
const SPECTRAL_IBI_MIN_CYCLES = 3;

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
	aliveFeatures: number; // alias retained for compatibility — now reports "valid row-projection samples"
	breathOffsets: number[];
	isLocked: boolean;
	lockAge: number;
	trackerVariance: number;
	displayState:
		| "uninitialized"
		| "searching"
		| "tracking"
		| "locked"
		| "holding";
};

export type BreathingFrame = {
	roiRgba: Uint8ClampedArray;
	roiWidth: number;
	roiHeight: number;
};

export type SubRegionDebug = {
	xFrac: number;
	yFrac: number;
	wFrac: number;
	hFrac: number;
	amplitude: number; // recent dy std dev in pixels
	contributed: boolean; // whether this region's dy fed into the latest median
	historyFill: number; // number of valid history samples (0..SUB_REGION_DEBUG_HISTORY)
};

export type BreathingEstimator = {
	feed(frame: BreathingFrame): void;
	estimate(): BreathingEstimate;
	reset(): void;
	getWaveform(): Float32Array;
	getRowProfile(): Float32Array;
	getDebugSubRegions(): SubRegionDebug[];
};

export function createBreathingEstimator(
	options: { sampleRateHz?: number; bufferSeconds?: number } = {},
): BreathingEstimator {
	const fs = options.sampleRateHz ?? SAMPLE_RATE_HZ;
	const seconds = options.bufferSeconds ?? BUFFER_SECONDS;
	const capacity = Math.round(fs * seconds);
	const exposureCooldown = Math.round(fs * EXPOSURE_COOLDOWN_S);

	const positionBuf = new Float32Array(capacity);
	let writeIdx = 0;
	let count = 0;

	let roiW = 0;
	let roiH = 0;
	let lumaBuf: Uint8Array | null = null;
	let lumaPrev: Uint8Array | null = null;
	let scratch: Uint8Array | null = null;
	let projectors: BlockMatcher[] = [];
	let subBuffers: Uint8Array[] = [];
	let subRegionW = 0;
	let subRegionH = 0;
	let lastDy = 0;
	let subRegionHistories: Float32Array[] = [];
	let subRegionHistoryFills: number[] = [];
	const subRegionContributed: boolean[] = new Array(NUM_SUB_REGIONS).fill(
		false,
	);
	let subRegionHistoryIdx = 0;
	const dySmoothing = new Float32Array(DY_SMOOTHING_WINDOW);
	let dySmoothingFill = 0;
	let dySmoothingIdx = 0;
	let validSampleCount = 0;

	const tracker: BpmTracker = createBpmTracker({
		lockVariance: LOCK_VARIANCE,
		lockFrames: LOCK_FRAMES,
	});
	const motionFlags: boolean[] = [];
	const motionWindow = Math.round(fs * MOTION_WINDOW_S);
	const recentRoiMeanLuma: number[] = [];
	let lastExposureFrame = -Infinity;
	let frameIdx = 0;
	let lastBreathOffsets: number[] = [];

	function ensureBuffers(w: number, h: number) {
		if (
			w === roiW &&
			h === roiH &&
			lumaBuf &&
			scratch &&
			projectors.length === NUM_SUB_REGIONS
		) {
			return;
		}
		roiW = w;
		roiH = h;
		lumaBuf = new Uint8Array(w * h);
		lumaPrev = new Uint8Array(w * h);
		scratch = new Uint8Array(w * h);
		subRegionW = Math.floor(w / SUB_REGION_COLS);
		subRegionH = Math.floor(h / SUB_REGION_ROWS);
		projectors = [];
		subBuffers = [];
		subRegionHistories = [];
		subRegionHistoryFills = [];
		for (let i = 0; i < NUM_SUB_REGIONS; i++) {
			projectors.push(createBlockMatcher(subRegionW, subRegionH));
			subBuffers.push(new Uint8Array(subRegionW * subRegionH));
			subRegionHistories.push(new Float32Array(SUB_REGION_DEBUG_HISTORY));
			subRegionHistoryFills.push(0);
			subRegionContributed[i] = false;
		}
		subRegionHistoryIdx = 0;
		lastDy = 0;
		validSampleCount = 0;
	}

	function snapshot(buf: Float32Array): Float32Array {
		const n = Math.min(count, capacity);
		const out = new Float32Array(n);
		const start = count < capacity ? 0 : writeIdx;
		for (let i = 0; i < n; i++) out[i] = buf[(start + i) % capacity];
		return out;
	}

	function pushPosition(p: number) {
		positionBuf[writeIdx] = p;
		writeIdx = (writeIdx + 1) % capacity;
		count++;
	}

	return {
		feed(frame: BreathingFrame) {
			ensureBuffers(frame.roiWidth, frame.roiHeight);
			if (
				!lumaBuf ||
				!lumaPrev ||
				!scratch ||
				projectors.length !== NUM_SUB_REGIONS
			) {
				return;
			}
			const N = roiW * roiH;

			// Grayscale + denoise.
			for (let i = 0, j = 0; j < N; i += 4, j++) {
				lumaBuf[j] =
					(frame.roiRgba[i] * 76 +
						frame.roiRgba[i + 1] * 150 +
						frame.roiRgba[i + 2] * 29) >>
					8;
			}
			boxBlur3x3(lumaBuf, roiW, roiH, scratch);

			// ROI mean luminance — used to detect autoexposure / lighting jumps
			// that actually affect the box (rather than the global frame, which
			// might change for reasons unrelated to what we're measuring).
			let roiMeanLuma = 0;
			for (let i = 0; i < N; i++) roiMeanLuma += lumaBuf[i];
			roiMeanLuma /= N;

			// Extract each sub-region into its own buffer and run row-projection
			// against its drifting template. dy is the *absolute* template-
			// relative shift, not a frame-to-frame delta — so the median across
			// regions IS the breathing signal (no cumulative accumulation).
			const dys: number[] = [];
			let confSum = 0;
			let confCount = 0;
			for (let s = 0; s < NUM_SUB_REGIONS; s++) {
				const col = s % SUB_REGION_COLS;
				const rowR = Math.floor(s / SUB_REGION_COLS);
				const startX = col * subRegionW;
				const startY = rowR * subRegionH;
				const sub = subBuffers[s];
				for (let y = 0; y < subRegionH; y++) {
					const srcRow = (startY + y) * roiW + startX;
					const dstRow = y * subRegionW;
					for (let x = 0; x < subRegionW; x++) {
						sub[dstRow + x] = lumaBuf[srcRow + x];
					}
				}
				const result = projectors[s].process(sub);
				const ok = !!result && result.confidence >= MIN_NCC_CONFIDENCE;
				subRegionContributed[s] = ok;
				if (ok && result) {
					dys.push(result.dy);
					confSum += result.confidence;
					confCount++;
					subRegionHistories[s][subRegionHistoryIdx] = result.dy;
					if (subRegionHistoryFills[s] < SUB_REGION_DEBUG_HISTORY) {
						subRegionHistoryFills[s]++;
					}
				} else {
					// Pad with last value (or 0 if none yet) to keep amplitudes
					// representative when occasional frames fail confidence check.
					const prev =
						subRegionHistoryFills[s] > 0
							? subRegionHistories[s][
									(subRegionHistoryIdx - 1 + SUB_REGION_DEBUG_HISTORY) %
										SUB_REGION_DEBUG_HISTORY
								]
							: 0;
					subRegionHistories[s][subRegionHistoryIdx] = prev;
				}
			}
			subRegionHistoryIdx =
				(subRegionHistoryIdx + 1) % SUB_REGION_DEBUG_HISTORY;
			let dy = 0;
			let medianDyValid = false;
			if (dys.length >= MIN_VALID_SUB_REGIONS) {
				dys.sort((a, b) => a - b);
				const mid = dys.length >> 1;
				dy = dys.length % 2 === 1 ? dys[mid] : 0.5 * (dys[mid - 1] + dys[mid]);
				// confSum / confCount is the mean NCC across contributing
				// sub-regions; unused in the current pipeline but kept as a
				// natural place to wire confidence weighting later.
				void confSum;
				void confCount;
				medianDyValid = true;
			}

			// Autoexposure / lighting-change detection — but driven by the
			// ROI's own mean luma, not the global frame. A change outside the
			// box (a person walking past, a phone notification flash) doesn't
			// affect the measurement, so we ignore it.
			if (detectExposureJump(recentRoiMeanLuma, roiMeanLuma)) {
				lastExposureFrame = frameIdx;
			}
			recentRoiMeanLuma.push(roiMeanLuma);
			if (recentRoiMeanLuma.length > RECENT_LUMA_WINDOW) {
				recentRoiMeanLuma.shift();
			}

			// Motion outlier: median dy is so big it almost certainly isn't
			// breathing. The median across 6 sub-regions already filtered local
			// motion; this catches the case where the whole ROI moves at once
			// (the template will catch up over a few seconds, but for now we
			// hold the displayed value).
			const isMotionOutlier = medianDyValid && Math.abs(dy) > MAX_FRAME_DY_PX;
			motionFlags.push(isMotionOutlier);
			if (motionFlags.length > motionWindow) motionFlags.shift();

			if (medianDyValid && !isMotionOutlier) {
				// Image-space y grows downward, but humans expect "inhale = up".
				// Inhale typically moves the imaged surface upward (smaller image
				// y) → row-projection reports a negative dy. Flip the sign so
				// positive position means chest expansion.
				const flipped = -dy;
				dySmoothing[dySmoothingIdx] = flipped;
				dySmoothingIdx = (dySmoothingIdx + 1) % DY_SMOOTHING_WINDOW;
				if (dySmoothingFill < DY_SMOOTHING_WINDOW) dySmoothingFill++;
				let sum = 0;
				for (let i = 0; i < dySmoothingFill; i++) sum += dySmoothing[i];
				lastDy = sum / dySmoothingFill;
				validSampleCount++;
			}
			// Always push so the buffer length tracks elapsed time — pushing
			// the unchanged value when we drop a frame keeps the spectrum
			// well-conditioned (flat segments don't add false energy in the
			// breathing band).
			pushPosition(lastDy);
			lumaPrev.set(lumaBuf);
			frameIdx++;
		},

		reset() {
			writeIdx = 0;
			count = 0;
			roiW = 0;
			roiH = 0;
			lumaBuf = null;
			lumaPrev = null;
			scratch = null;
			projectors = [];
			subBuffers = [];
			subRegionHistories = [];
			subRegionHistoryFills = [];
			subRegionHistoryIdx = 0;
			for (let i = 0; i < NUM_SUB_REGIONS; i++) subRegionContributed[i] = false;
			subRegionW = 0;
			subRegionH = 0;
			lastDy = 0;
			validSampleCount = 0;
			frameIdx = 0;
			recentRoiMeanLuma.length = 0;
			lastExposureFrame = -Infinity;
			lastBreathOffsets = [];
			motionFlags.length = 0;
			tracker.reset();
		},

		getWaveform() {
			return snapshot(positionBuf);
		},

		getRowProfile() {
			// Synthesize a 1D profile from the center sub-region's 2D template
			// (mean luma per row) — block-match doesn't track a 1D profile
			// itself, but a row mean is still a useful at-a-glance debug
			// visualization of what the algorithm is locked onto.
			const centerIdx = Math.floor(NUM_SUB_REGIONS / 2);
			const tmpl = projectors[centerIdx]?.getTemplate();
			if (!tmpl || subRegionH === 0 || subRegionW === 0) {
				return new Float32Array(0);
			}
			const out = new Float32Array(subRegionH);
			for (let y = 0; y < subRegionH; y++) {
				let s = 0;
				for (let x = 0; x < subRegionW; x++) s += tmpl[y * subRegionW + x];
				out[y] = s / subRegionW;
			}
			return out;
		},

		getDebugSubRegions(): SubRegionDebug[] {
			if (projectors.length !== NUM_SUB_REGIONS || roiW === 0 || roiH === 0) {
				return [];
			}
			const out: SubRegionDebug[] = [];
			for (let s = 0; s < NUM_SUB_REGIONS; s++) {
				const col = s % SUB_REGION_COLS;
				const rowR = Math.floor(s / SUB_REGION_COLS);
				const startX = col * subRegionW;
				const startY = rowR * subRegionH;
				const fill = subRegionHistoryFills[s];
				let mean = 0;
				for (let i = 0; i < fill; i++) mean += subRegionHistories[s][i];
				mean = fill > 0 ? mean / fill : 0;
				let variance = 0;
				for (let i = 0; i < fill; i++) {
					const d = subRegionHistories[s][i] - mean;
					variance += d * d;
				}
				const amplitude = fill > 1 ? Math.sqrt(variance / fill) : 0;
				out.push({
					xFrac: startX / roiW,
					yFrac: startY / roiH,
					wFrac: subRegionW / roiW,
					hFrac: subRegionH / roiH,
					amplitude,
					contributed: subRegionContributed[s],
					historyFill: fill,
				});
			}
			return out;
		},

		estimate() {
			const samplesReady = Math.min(count, capacity);
			const bufferSeconds = samplesReady / fs;
			// "shakeRecent" now means "the ROI itself has been seeing too
			// much motion to trust" — derived from the per-frame motion-
			// outlier rate. We no longer look at anything outside the box.
			const motionDropCount = motionFlags.filter(Boolean).length;
			const shakeRecent =
				motionFlags.length >= fs && motionDropCount / motionFlags.length >= 0.3;
			const exposureJumpRecent =
				frameIdx - lastExposureFrame < exposureCooldown;
			const trackerState = tracker.getState();

			const baseEmpty: BreathingEstimate = {
				bpm: null,
				bpmSd: null,
				regularityCV: null,
				cycleCount: 0,
				quality: zeroQuality(),
				samplesReady,
				bufferSeconds,
				shakeRecent,
				exposureJumpRecent,
				aliveFeatures: validSampleCount,
				breathOffsets: [],
				isLocked: false,
				lockAge: 0,
				trackerVariance: trackerState.variance,
				displayState: "searching",
			};

			if (bufferSeconds < MIN_ESTIMATE_SECONDS) {
				return {
					...baseEmpty,
					displayState: validSampleCount === 0 ? "uninitialized" : "searching",
				};
			}

			const samples = snapshot(positionBuf);
			const cleaned = hampelFilter(samples, HAMPEL_WINDOW, 3);
			const detrended = detrend(cleaned);

			// Apply the wide bandpass BEFORE spectral analysis. This is the
			// critical fix: the low cutoff (0.2 Hz / 12 BPM) excludes the
			// band where slow template-drift artifacts live, so the Welch
			// peak picker can't fixate on them. For cycle detection, narrow
			// further around the locked frequency once we have a lock.
			const wideBp = bandpass(detrended, fs, BANDPASS_LOW_HZ, BANDPASS_HIGH_HZ);
			const lockedFreqHz = trackerState.isLocked ? trackerState.bpm / 60 : null;
			const bp = lockedFreqHz
				? bandpass(
						wideBp,
						fs,
						Math.max(
							BANDPASS_LOW_HZ,
							lockedFreqHz - ADAPTIVE_BANDPASS_HALF_WIDTH_HZ,
						),
						Math.min(
							BANDPASS_HIGH_HZ,
							lockedFreqHz + ADAPTIVE_BANDPASS_HALF_WIDTH_HZ,
						),
					)
				: wideBp;

			const { freq, psd } = welchPSD(wideBp, fs, {
				segmentLength: 256,
				overlap: 0.5,
			});
			const peak = findPSDPeak(freq, psd, BPM_MIN / 60, BPM_MAX / 60);

			let measurementBpm: number | null = null;
			let snr = 0;
			let peakNormalized = 0;
			if (peak && peak.snr >= MIN_MEASUREMENT_SNR) {
				const candidateBpm = peak.freq * 60;
				if (candidateBpm >= BPM_MIN && candidateBpm <= BPM_MAX) {
					measurementBpm = candidateBpm;
					snr = peak.snr;
					peakNormalized = peak.bandPower > 0 ? peak.power / peak.bandPower : 0;
				}
			}

			// Cycle detection via zero crossings — robust to amplitude
			// variation. Hysteresis scales with signal magnitude so noise
			// flicker around zero doesn't double-count, but real cycles always
			// pass.
			const sd = stddev(bp);
			const minSep = Math.round(MIN_BREATH_SEP_S * fs);
			const hysteresis = sd * ZERO_CROSSING_HYSTERESIS_FRACTION;
			const cycles = findCycles(bp, minSep, hysteresis);
			lastBreathOffsets = cycles.peakIndices;
			const ibi = analyzeIBI(cycles.zeroCrossings, fs);

			// Quality calculated even when there's no peak (it'll be near-zero).
			const quality = computeQuality({
				spectralSnr: snr,
				spectralPeakNormalized: peakNormalized,
				regularityCV: ibi.regularityCV,
				aliveFeatures: validSampleCount,
				targetFeatures: capacity,
				shakeFraction:
					motionFlags.length > 0 ? motionDropCount / motionFlags.length : 0,
				exposureJumpRecent,
				cycleCount: ibi.cycleCount,
			});

			// Feed the spectral measurement to the temporal tracker — but only
			// when we trust it. Once locked, low-quality measurements (e.g.,
			// subject body motion that briefly degrades the breathing signal)
			// are dropped entirely so the locked value persists. The state
			// becomes "holding" until quality recovers.
			const previouslyLocked = trackerState.isLocked;
			const motionDropFraction =
				motionFlags.length > 0
					? motionFlags.filter(Boolean).length / motionFlags.length
					: 0;
			const motionHolding = motionDropFraction >= MOTION_HOLD_FRACTION;
			// Spectral peak says one BPM, time-domain IBI says another — when
			// they disagree wildly, the buffer is too noisy to trust. Don't
			// feed the tracker; let it stay where it was. Once spectrum and
			// time-domain converge, updates resume.
			const ibiBpm = ibi.meanBpm;
			const spectralIbiDisagree =
				measurementBpm != null &&
				ibiBpm != null &&
				ibi.cycleCount >= SPECTRAL_IBI_MIN_CYCLES &&
				Math.max(measurementBpm, ibiBpm) /
					Math.max(1e-6, Math.min(measurementBpm, ibiBpm)) >
					SPECTRAL_IBI_AGREEMENT_RATIO;
			const holding =
				previouslyLocked &&
				measurementBpm != null &&
				(quality.total < HOLD_QUALITY_THRESHOLD ||
					motionHolding ||
					spectralIbiDisagree);
			if (measurementBpm != null && !holding && !spectralIbiDisagree) {
				const measVar = bpmMeasurementVariance(snr, quality.total);
				tracker.update(measurementBpm, measVar);
			}
			const updatedState = tracker.getState();

			const bpm = updatedState.initialized ? updatedState.bpm : null;
			const displayState: BreathingEstimate["displayState"] =
				!updatedState.initialized
					? "searching"
					: holding
						? "holding"
						: updatedState.isLocked
							? "locked"
							: "tracking";

			return {
				bpm,
				bpmSd: ibi.sdBpm,
				regularityCV: ibi.regularityCV,
				cycleCount: ibi.cycleCount,
				quality,
				samplesReady,
				bufferSeconds,
				shakeRecent,
				exposureJumpRecent,
				aliveFeatures: validSampleCount,
				breathOffsets: lastBreathOffsets.slice(),
				isLocked: updatedState.isLocked,
				lockAge: updatedState.lockAge,
				trackerVariance: updatedState.variance,
				displayState,
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

function zeroQuality(): QualityScore {
	return {
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
}
