export const SAMPLE_RATE_HZ = 30;
export const BUFFER_SECONDS = 20;
export const BPM_MIN = 5;
export const BPM_MAX = 80;

const MIN_ESTIMATE_SECONDS = 8;
const SMOOTHING_WINDOW = 5;
const BANDPASS_LOW_HZ = 0.08;
const BANDPASS_HIGH_HZ = 1.5;
const SHAKE_RATIO = 4;
const SHAKE_WARN_FRACTION = 0.3;
const ROI_MAG_EMA_ALPHA = 0.05;

export type ActiveSignal = "edge" | "diff" | null;

export type BreathingEstimate = {
	bpm: number | null;
	confidence: number;
	samplesReady: number;
	bufferSeconds: number;
	shakeRecent: boolean;
	activeSignal: ActiveSignal;
};

export type FrameSignals = {
	edge: number;
	diff: number;
	globalDiff: number;
};

/**
 * Per-frame signal extraction. Caller supplies a Uint8 luminance output buffer
 * (`curr`), the previous frame's luminance buffer (or null for the first
 * frame), and a `scratch` buffer of the same size. Writes the post-blur
 * grayscale into `curr` so the caller can swap buffers for the next frame.
 */
export function extractSignals(
	rgba: Uint8ClampedArray,
	width: number,
	height: number,
	curr: Uint8Array,
	prev: Uint8Array | null,
	scratch: Uint8Array,
): { edge: number; diff: number } {
	const N = width * height;
	for (let i = 0, j = 0; j < N; i += 4, j++) {
		curr[j] = (rgba[i] * 76 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
	}
	boxBlur3x3(curr, width, height, scratch);

	const halfH = height >> 1;
	let topSum = 0;
	let botSum = 0;
	for (let y = 0; y < halfH; y++) {
		const row = y * width;
		for (let x = 0; x < width; x++) topSum += curr[row + x];
	}
	for (let y = halfH; y < height; y++) {
		const row = y * width;
		for (let x = 0; x < width; x++) botSum += curr[row + x];
	}
	const edge = (topSum - botSum) / (width * halfH);

	let diff = 0;
	if (prev && prev.length === curr.length) {
		for (let i = 0; i < N; i++) diff += Math.abs(curr[i] - prev[i]);
		diff /= N;
	}

	return { edge, diff };
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

export type BreathingEstimator = {
	feed(signals: FrameSignals): void;
	estimate(): BreathingEstimate;
	reset(): void;
	getWaveform(): Float32Array;
};

export function createBreathingEstimator(
	options: { sampleRateHz?: number; bufferSeconds?: number } = {},
): BreathingEstimator {
	const fs = options.sampleRateHz ?? SAMPLE_RATE_HZ;
	const seconds = options.bufferSeconds ?? BUFFER_SECONDS;
	const capacity = Math.round(fs * seconds);
	const edgeBuf = new Float32Array(capacity);
	const diffBuf = new Float32Array(capacity);
	const shakeWindow = Math.round(fs * 2);
	const shakeWarmup = fs;
	const shakeFlags: boolean[] = [];
	let writeIdx = 0;
	let count = 0;
	let roiMagEma = 0;
	let lastActive: ActiveSignal = null;
	const recentBpm: number[] = [];

	function snapshot(buf: Float32Array): Float32Array {
		const n = Math.min(count, capacity);
		const out = new Float32Array(n);
		const start = count < capacity ? 0 : writeIdx;
		for (let i = 0; i < n; i++) out[i] = buf[(start + i) % capacity];
		return out;
	}

	function estimateFromBuffer(samples: Float32Array): {
		bpm: number | null;
		confidence: number;
	} {
		if (samples.length < fs * MIN_ESTIMATE_SECONDS) {
			return { bpm: null, confidence: 0 };
		}
		const filtered = bandpass(samples, fs, BANDPASS_LOW_HZ, BANDPASS_HIGH_HZ);
		const x = detrend(filtered);
		const lagMin = Math.max(2, Math.floor((fs * 60) / BPM_MAX));
		const lagMax = Math.min(x.length - 2, Math.ceil((fs * 60) / BPM_MIN));
		const { lag, value, r0, r } = autocorrelate(x, lagMin, lagMax);
		if (lag < 0 || r0 <= 0) return { bpm: null, confidence: 0 };
		const refinedLag = parabolicInterp(r, lag, lagMin, lagMax);
		const bpm = (60 * fs) / refinedLag;
		const confidence = clamp01(value / r0);
		return { bpm, confidence };
	}

	return {
		feed(signals: FrameSignals) {
			const roiMag = Math.abs(signals.edge) + Math.abs(signals.diff);

			// Warm-up: accept first second unconditionally to seed roiMagEma.
			if (count < shakeWarmup) {
				roiMagEma =
					roiMagEma === 0
						? roiMag
						: (1 - ROI_MAG_EMA_ALPHA) * roiMagEma + ROI_MAG_EMA_ALPHA * roiMag;
				edgeBuf[writeIdx] = signals.edge;
				diffBuf[writeIdx] = signals.diff;
				writeIdx = (writeIdx + 1) % capacity;
				count++;
				return;
			}

			const baseline = Math.max(roiMagEma, 1e-6);
			const isShake = signals.globalDiff > SHAKE_RATIO * baseline;
			shakeFlags.push(isShake);
			if (shakeFlags.length > shakeWindow) shakeFlags.shift();
			if (isShake) return;

			roiMagEma =
				(1 - ROI_MAG_EMA_ALPHA) * roiMagEma + ROI_MAG_EMA_ALPHA * roiMag;
			edgeBuf[writeIdx] = signals.edge;
			diffBuf[writeIdx] = signals.diff;
			writeIdx = (writeIdx + 1) % capacity;
			count++;
		},
		reset() {
			writeIdx = 0;
			count = 0;
			roiMagEma = 0;
			lastActive = null;
			shakeFlags.length = 0;
			recentBpm.length = 0;
		},
		getWaveform() {
			return snapshot(lastActive === "edge" ? edgeBuf : diffBuf);
		},
		estimate() {
			const samplesReady = Math.min(count, capacity);
			const bufferSeconds = samplesReady / fs;
			const dropCount = shakeFlags.filter(Boolean).length;
			const shakeRecent =
				shakeFlags.length >= fs &&
				dropCount / shakeFlags.length >= SHAKE_WARN_FRACTION;

			if (bufferSeconds < MIN_ESTIMATE_SECONDS) {
				return {
					bpm: null,
					confidence: 0,
					samplesReady,
					bufferSeconds,
					shakeRecent,
					activeSignal: null,
				};
			}

			const edgeRes = estimateFromBuffer(snapshot(edgeBuf));
			const diffRes = estimateFromBuffer(snapshot(diffBuf));
			const winner: ActiveSignal =
				edgeRes.confidence >= diffRes.confidence ? "edge" : "diff";
			const r = winner === "edge" ? edgeRes : diffRes;
			lastActive = winner;

			if (r.bpm == null) {
				return {
					bpm: null,
					confidence: r.confidence,
					samplesReady,
					bufferSeconds,
					shakeRecent,
					activeSignal: winner,
				};
			}

			recentBpm.push(r.bpm);
			if (recentBpm.length > SMOOTHING_WINDOW) recentBpm.shift();
			const smoothed = recentBpm.reduce((a, b) => a + b, 0) / recentBpm.length;

			return {
				bpm: smoothed,
				confidence: r.confidence,
				samplesReady,
				bufferSeconds,
				shakeRecent,
				activeSignal: winner,
			};
		},
	};
}

function detrend(samples: Float32Array): Float32Array {
	let mean = 0;
	for (const s of samples) mean += s;
	mean /= samples.length;
	const out = new Float32Array(samples.length);
	for (let i = 0; i < samples.length; i++) out[i] = samples[i] - mean;
	return out;
}

// Cascade of 1st-order RC highpass + lowpass. Cheap, stable, ~6 dB/octave
// rolloff on each side — enough to reject hand tremor (>4 Hz) without ringing.
function bandpass(
	samples: Float32Array,
	fs: number,
	lowHz: number,
	highHz: number,
): Float32Array {
	const dt = 1 / fs;
	const rcHp = 1 / (2 * Math.PI * lowHz);
	const aHp = rcHp / (rcHp + dt);
	const rcLp = 1 / (2 * Math.PI * highHz);
	const aLp = dt / (rcLp + dt);
	const out = new Float32Array(samples.length);
	let hpPrevIn = samples[0];
	let hpPrevOut = 0;
	let lpPrev = 0;
	for (let i = 0; i < samples.length; i++) {
		const x = samples[i];
		const hp = aHp * (hpPrevOut + x - hpPrevIn);
		hpPrevIn = x;
		hpPrevOut = hp;
		lpPrev = lpPrev + aLp * (hp - lpPrev);
		out[i] = lpPrev;
	}
	return out;
}

function autocorrelate(
	x: Float32Array,
	lagMin: number,
	lagMax: number,
): { lag: number; value: number; r0: number; r: Float32Array } {
	const N = x.length;
	let r0 = 0;
	for (let i = 0; i < N; i++) r0 += x[i] * x[i];
	r0 /= N;

	const r = new Float32Array(lagMax + 1);
	for (let k = lagMin; k <= lagMax; k++) {
		let s = 0;
		const end = N - k;
		for (let i = 0; i < end; i++) s += x[i] * x[i + k];
		r[k] = s / end;
	}

	const threshold = 0.5 * r0;
	for (let k = lagMin + 1; k < lagMax; k++) {
		if (r[k] > r[k - 1] && r[k] >= r[k + 1] && r[k] > threshold) {
			return { lag: k, value: r[k], r0, r };
		}
	}

	let bestLag = -1;
	let bestVal = -Infinity;
	for (let k = lagMin; k <= lagMax; k++) {
		if (r[k] > bestVal) {
			bestVal = r[k];
			bestLag = k;
		}
	}
	return { lag: bestLag, value: bestVal, r0, r };
}

function parabolicInterp(
	r: Float32Array,
	k: number,
	lagMin: number,
	lagMax: number,
): number {
	if (k <= lagMin || k >= lagMax) return k;
	const ym1 = r[k - 1];
	const y0 = r[k];
	const yp1 = r[k + 1];
	const denom = ym1 - 2 * y0 + yp1;
	if (denom === 0) return k;
	return k + (0.5 * (ym1 - yp1)) / denom;
}

function clamp01(v: number): number {
	if (v < 0) return 0;
	if (v > 1) return 1;
	return v;
}
