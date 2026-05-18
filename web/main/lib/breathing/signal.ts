/**
 * Hampel outlier filter. Replaces each point whose deviation from the local
 * median exceeds `threshold` × MAD (scaled to σ) with the median itself.
 * Robust to single-frame spikes (autofocus pulses, brief occlusions).
 */
export function hampelFilter(
	signal: Float32Array,
	windowSize: number,
	threshold = 3,
): Float32Array {
	const out = new Float32Array(signal.length);
	const half = windowSize >> 1;
	const window: number[] = new Array(windowSize);
	const mads: number[] = new Array(windowSize);
	for (let i = 0; i < signal.length; i++) {
		const start = Math.max(0, i - half);
		const end = Math.min(signal.length, i + half + 1);
		let n = 0;
		for (let j = start; j < end; j++) window[n++] = signal[j];
		const w = window.slice(0, n).sort((a, b) => a - b);
		const median = w[n >> 1];
		for (let k = 0; k < n; k++) mads[k] = Math.abs(w[k] - median);
		const mw = mads.slice(0, n).sort((a, b) => a - b);
		const mad = mw[n >> 1];
		const sigma = 1.4826 * mad;
		if (sigma > 0 && Math.abs(signal[i] - median) > threshold * sigma) {
			out[i] = median;
		} else {
			out[i] = signal[i];
		}
	}
	return out;
}

/** Detrend by subtracting the global mean. */
export function detrend(samples: Float32Array): Float32Array {
	let mean = 0;
	for (const s of samples) mean += s;
	mean /= samples.length;
	const out = new Float32Array(samples.length);
	for (let i = 0; i < samples.length; i++) out[i] = samples[i] - mean;
	return out;
}

/**
 * 4th-order Butterworth bandpass implemented as a cascade of two
 * RBJ-cookbook biquad sections. ~24 dB/octave rolloff on both sides —
 * much sharper than a 1st-order RC cascade, so high-frequency noise
 * doesn't leak through and pollute the time-domain zero-crossing
 * counter.
 */
export function bandpass(
	samples: Float32Array,
	fs: number,
	lowHz: number,
	highHz: number,
): Float32Array {
	if (samples.length === 0) return samples;
	const f0 = Math.sqrt(Math.max(1e-6, lowHz * highHz));
	const bw = Math.max(1e-6, highHz - lowHz);
	const Q = Math.max(0.1, f0 / bw);
	const omega = (2 * Math.PI * f0) / fs;
	const alpha = Math.sin(omega) / (2 * Q);
	const cosO = Math.cos(omega);
	const a0 = 1 + alpha;
	const b0n = alpha / a0;
	const b2n = -alpha / a0;
	const a1n = (-2 * cosO) / a0;
	const a2n = (1 - alpha) / a0;
	return applyBiquad(
		applyBiquad(samples, b0n, b2n, a1n, a2n),
		b0n,
		b2n,
		a1n,
		a2n,
	);
}

function applyBiquad(
	input: Float32Array,
	b0: number,
	b2: number,
	a1: number,
	a2: number,
): Float32Array {
	const out = new Float32Array(input.length);
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	for (let i = 0; i < input.length; i++) {
		const x0 = input[i];
		const y0 = b0 * x0 + b2 * x2 - a1 * y1 - a2 * y2;
		out[i] = y0;
		x2 = x1;
		x1 = x0;
		y2 = y1;
		y1 = y0;
	}
	return out;
}

/**
 * Cycle detection via positive-going zero crossings of a zero-mean
 * (typically bandpassed) signal. Each crossing defines a cycle boundary;
 * the max value between consecutive crossings is the breath peak. Far
 * more robust than threshold-based peak detection — works for any
 * amplitude as long as the signal oscillates around zero, which is
 * exactly what a bandpassed breathing trace does.
 *
 * Hysteresis: a crossing only counts when the signal has dipped at least
 * `hysteresis` below zero since the last crossing. This rejects rapid
 * sign-flicker around zero from residual noise without a fixed threshold.
 */
export function findCycles(
	signal: Float32Array,
	minSeparation: number,
	hysteresis = 0,
): { zeroCrossings: number[]; peakIndices: number[] } {
	const zeroCrossings: number[] = [];
	let lastCrossing = -Infinity;
	let dippedBelowSince = true; // first crossing accepts any direction

	for (let i = 1; i < signal.length; i++) {
		if (signal[i - 1] < -hysteresis) dippedBelowSince = true;
		if (
			dippedBelowSince &&
			signal[i - 1] < 0 &&
			signal[i] >= 0 &&
			i - lastCrossing >= minSeparation
		) {
			zeroCrossings.push(i);
			lastCrossing = i;
			dippedBelowSince = false;
		}
	}

	const peakIndices: number[] = [];
	for (let c = 0; c < zeroCrossings.length; c++) {
		const start = zeroCrossings[c];
		const end =
			c + 1 < zeroCrossings.length ? zeroCrossings[c + 1] : signal.length;
		let maxIdx = start;
		let maxVal = signal[start];
		for (let j = start + 1; j < end; j++) {
			if (signal[j] > maxVal) {
				maxVal = signal[j];
				maxIdx = j;
			}
		}
		peakIndices.push(maxIdx);
	}
	return { zeroCrossings, peakIndices };
}

/**
 * Inter-breath interval (IBI) statistics. Given peak indices in samples,
 * returns mean BPM, BPM standard deviation (first-order propagation), and
 * a coefficient-of-variation rhythm regularity score.
 */
export function analyzeIBI(
	peakIndices: number[],
	fs: number,
): {
	meanBpm: number | null;
	sdBpm: number | null;
	regularityCV: number | null;
	cycleCount: number;
} {
	if (peakIndices.length < 2) {
		return {
			meanBpm: null,
			sdBpm: null,
			regularityCV: null,
			cycleCount: peakIndices.length,
		};
	}
	const intervals: number[] = [];
	for (let i = 1; i < peakIndices.length; i++) {
		intervals.push((peakIndices[i] - peakIndices[i - 1]) / fs);
	}
	const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
	if (mean <= 0) {
		return {
			meanBpm: null,
			sdBpm: null,
			regularityCV: null,
			cycleCount: peakIndices.length,
		};
	}
	let variance = 0;
	for (const v of intervals) variance += (v - mean) ** 2;
	variance /= intervals.length;
	const sd = Math.sqrt(variance);
	const meanBpm = 60 / mean;
	const sdBpm = (60 * sd) / (mean * mean);
	const regularityCV = sd / mean;
	return { meanBpm, sdBpm, regularityCV, cycleCount: peakIndices.length };
}

/** Sample standard deviation. */
export function stddev(values: ArrayLike<number>): number {
	const n = values.length;
	if (n < 2) return 0;
	let mean = 0;
	for (let i = 0; i < n; i++) mean += values[i];
	mean /= n;
	let v = 0;
	for (let i = 0; i < n; i++) v += (values[i] - mean) ** 2;
	return Math.sqrt(v / (n - 1));
}
