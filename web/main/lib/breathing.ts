export const SAMPLE_RATE_HZ = 30;
export const BUFFER_SECONDS = 20;
export const BPM_MIN = 5;
export const BPM_MAX = 80;
const MIN_ESTIMATE_SECONDS = 8;
const SMOOTHING_WINDOW = 5;

export type BreathingEstimate = {
	bpm: number | null;
	confidence: number;
	samplesReady: number;
	bufferSeconds: number;
};

export function computeFrameDiff(
	curr: Uint8ClampedArray,
	prev: Uint8ClampedArray,
): number {
	if (curr.length !== prev.length) return 0;
	let sum = 0;
	for (let i = 0; i < curr.length; i += 4) {
		const lc = curr[i] * 76 + curr[i + 1] * 150 + curr[i + 2] * 29;
		const lp = prev[i] * 76 + prev[i + 1] * 150 + prev[i + 2] * 29;
		sum += Math.abs(lc - lp);
	}
	return sum / 256;
}

export type BreathingEstimator = {
	feed(value: number): void;
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
	const buf = new Float32Array(capacity);
	let count = 0;
	let writeIdx = 0;
	const recentBpm: number[] = [];

	function snapshot(): Float32Array {
		const n = Math.min(count, capacity);
		const out = new Float32Array(n);
		const start = count < capacity ? 0 : writeIdx;
		for (let i = 0; i < n; i++) out[i] = buf[(start + i) % capacity];
		return out;
	}

	return {
		feed(value: number) {
			buf[writeIdx] = value;
			writeIdx = (writeIdx + 1) % capacity;
			count++;
		},
		reset() {
			writeIdx = 0;
			count = 0;
			recentBpm.length = 0;
		},
		getWaveform() {
			return snapshot();
		},
		estimate() {
			const samples = snapshot();
			const samplesReady = samples.length;
			const bufferSeconds = samplesReady / fs;
			if (bufferSeconds < MIN_ESTIMATE_SECONDS) {
				return { bpm: null, confidence: 0, samplesReady, bufferSeconds };
			}

			const x = detrend(samples);
			const lagMin = Math.max(2, Math.floor((fs * 60) / BPM_MAX));
			const lagMax = Math.min(x.length - 2, Math.ceil((fs * 60) / BPM_MIN));
			const { lag, value, r0, r } = autocorrelate(x, lagMin, lagMax);
			if (lag < 0 || r0 <= 0) {
				return { bpm: null, confidence: 0, samplesReady, bufferSeconds };
			}

			const refinedLag = parabolicInterp(r, lag, lagMin, lagMax);
			const rawBpm = (60 * fs) / refinedLag;
			const confidence = clamp01(value / r0);

			recentBpm.push(rawBpm);
			if (recentBpm.length > SMOOTHING_WINDOW) recentBpm.shift();
			const smoothed = recentBpm.reduce((a, b) => a + b, 0) / recentBpm.length;

			return {
				bpm: smoothed,
				confidence,
				samplesReady,
				bufferSeconds,
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

	// Prefer the FIRST local maximum above threshold — that's the fundamental
	// period. Global max can land on a harmonic when the signal is near-sinusoidal.
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
