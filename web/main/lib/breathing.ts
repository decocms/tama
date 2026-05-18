import { type Corner, detectCorners } from "./breathing/corners.ts";
import { findPSDPeak, welchPSD } from "./breathing/fft.ts";
import {
	computeQuality,
	detectExposureJump,
	type QualityScore,
} from "./breathing/quality.ts";
import {
	createRowProjector,
	type RowProjector,
} from "./breathing/row-projection.ts";
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
export const BPM_MIN = 5;
export const BPM_MAX = 80;

const HAMPEL_WINDOW = 7;
const MIN_ESTIMATE_SECONDS = 6;
const BANDPASS_LOW_HZ = 0.08;
const BANDPASS_HIGH_HZ = 1.5;
const ADAPTIVE_BANDPASS_HALF_WIDTH_HZ = 0.18;
const MIN_BREATH_SEP_S = 0.5;
const ZERO_CROSSING_HYSTERESIS_FRACTION = 0.15;
const SHAKE_RATIO = 4;
const SHAKE_WARN_FRACTION = 0.3;
const SHAKE_WARMUP_S = 1;
const ROI_MAG_EMA_ALPHA = 0.05;
const RECENT_LUMA_WINDOW = 8;
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
	globalDiff: number;
	globalMeanLuma: number;
};

export type BreathingEstimator = {
	feed(frame: BreathingFrame): void;
	estimate(): BreathingEstimate;
	reset(): void;
	getWaveform(): Float32Array;
	getRowProfile(): Float32Array;
	getDebugCorners(maxCount?: number): Array<{
		xFrac: number;
		yFrac: number;
	}>;
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

	const positionBuf = new Float32Array(capacity);
	let writeIdx = 0;
	let count = 0;

	let roiW = 0;
	let roiH = 0;
	let lumaBuf: Uint8Array | null = null;
	let lumaPrev: Uint8Array | null = null;
	let scratch: Uint8Array | null = null;
	let projectors: RowProjector[] = [];
	let subBuffers: Uint8Array[] = [];
	let subRegionW = 0;
	let subRegionH = 0;
	let lastDy = 0;
	let validSampleCount = 0;

	const tracker: BpmTracker = createBpmTracker({
		lockVariance: LOCK_VARIANCE,
		lockFrames: LOCK_FRAMES,
	});
	const shakeFlags: boolean[] = [];
	const motionFlags: boolean[] = [];
	const motionWindow = Math.round(fs * MOTION_WINDOW_S);
	let roiMagEma = 0;
	const recentMeanLuma: number[] = [];
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
		for (let i = 0; i < NUM_SUB_REGIONS; i++) {
			projectors.push(createRowProjector(subRegionW, subRegionH));
			subBuffers.push(new Uint8Array(subRegionW * subRegionH));
		}
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

			// ROI luma frame-difference — same units as `frame.globalDiff`, so
			// the shake gate can compare them apples-to-apples. This is the
			// natural baseline for "how much is happening inside the ROI?"
			// regardless of where the breathing signal comes from.
			let roiDiff = 0;
			if (frameIdx > 0) {
				let sum = 0;
				for (let i = 0; i < N; i++) sum += Math.abs(lumaBuf[i] - lumaPrev[i]);
				roiDiff = sum / N;
			}

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
				if (result && result.confidence >= MIN_NCC_CONFIDENCE) {
					dys.push(result.dy);
					confSum += result.confidence;
					confCount++;
				}
			}
			let dy = 0;
			let ncc = 0;
			let medianDyValid = false;
			if (dys.length >= MIN_VALID_SUB_REGIONS) {
				dys.sort((a, b) => a - b);
				const mid = dys.length >> 1;
				dy = dys.length % 2 === 1 ? dys[mid] : 0.5 * (dys[mid - 1] + dys[mid]);
				ncc = confSum / confCount;
				medianDyValid = true;
			}

			// Shake gate: global motion >> ROI's own activity → camera-led.
			const isWarmup = frameIdx < shakeWarmup;
			if (!isWarmup) {
				const baseline = Math.max(roiMagEma, 0.5);
				const isShake = frame.globalDiff > SHAKE_RATIO * baseline;
				shakeFlags.push(isShake);
				if (shakeFlags.length > shakeWindow) shakeFlags.shift();
				if (isShake) {
					lumaPrev.set(lumaBuf);
					frameIdx++;
					return;
				}
			}

			if (detectExposureJump(recentMeanLuma, frame.globalMeanLuma)) {
				lastExposureFrame = frameIdx;
			}
			recentMeanLuma.push(frame.globalMeanLuma);
			if (recentMeanLuma.length > RECENT_LUMA_WINDOW) recentMeanLuma.shift();

			// Track the ROI's luma-domain motion baseline. EMA is robust to
			// occasional zero frames at session start.
			if (frameIdx >= shakeWarmup) {
				roiMagEma =
					(1 - ROI_MAG_EMA_ALPHA) * roiMagEma + ROI_MAG_EMA_ALPHA * roiDiff;
			} else {
				roiMagEma = roiMagEma === 0 ? roiDiff : 0.7 * roiMagEma + 0.3 * roiDiff;
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
				lastDy = -dy;
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
			subRegionW = 0;
			subRegionH = 0;
			lastDy = 0;
			validSampleCount = 0;
			frameIdx = 0;
			roiMagEma = 0;
			shakeFlags.length = 0;
			recentMeanLuma.length = 0;
			lastExposureFrame = -Infinity;
			lastBreathOffsets = [];
			motionFlags.length = 0;
			tracker.reset();
		},

		getWaveform() {
			return snapshot(positionBuf);
		},

		getRowProfile() {
			// Return the center-region profile as a representative sample for
			// the debug visualization.
			const centerIdx = Math.floor(NUM_SUB_REGIONS / 2);
			return projectors[centerIdx]?.getCurrentProfile() ?? new Float32Array(0);
		},

		getDebugCorners(maxCount = 24) {
			if (!lumaBuf || roiW === 0 || roiH === 0) return [];
			const corners: Corner[] = detectCorners(lumaBuf, roiW, roiH, maxCount);
			return corners.map((c) => ({
				xFrac: c.x / roiW,
				yFrac: c.y / roiH,
			}));
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

			// Use a narrow tracking bandpass once locked — much cleaner
			// time-domain signal for peak detection and IBI analysis.
			const lockedFreqHz = trackerState.isLocked ? trackerState.bpm / 60 : null;
			const bpLow = lockedFreqHz
				? Math.max(
						BANDPASS_LOW_HZ,
						lockedFreqHz - ADAPTIVE_BANDPASS_HALF_WIDTH_HZ,
					)
				: BANDPASS_LOW_HZ;
			const bpHigh = lockedFreqHz
				? Math.min(
						BANDPASS_HIGH_HZ,
						lockedFreqHz + ADAPTIVE_BANDPASS_HALF_WIDTH_HZ,
					)
				: BANDPASS_HIGH_HZ;
			const bp = bandpass(detrended, fs, bpLow, bpHigh);

			const { freq, psd } = welchPSD(detrended, fs, {
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
					shakeFlags.length > 0 ? dropCount / shakeFlags.length : 0,
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
			const holding =
				previouslyLocked &&
				measurementBpm != null &&
				(quality.total < HOLD_QUALITY_THRESHOLD || motionHolding);
			if (measurementBpm != null && !holding) {
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
