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
 * Cascade of 1st-order RC HP + LP, applied as IIR over the whole signal.
 * Cheap, stable, ~6 dB/octave on each side — enough to remove DC drift
 * and reject hand tremor / wobble above ~3 Hz while passing the
 * 0.08–1.5 Hz breathing band.
 */
export function bandpass(
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
	let hpPrevIn = samples.length > 0 ? samples[0] : 0;
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

/**
 * Peak detection with minimum separation + prominence. Used to find
 * individual breath onsets in the filtered time series. Returns indices
 * into `signal`.
 */
export function findPeaks(
	signal: Float32Array,
	minSeparation: number,
	prominence: number,
): number[] {
	const peaks: number[] = [];
	for (let i = 1; i < signal.length - 1; i++) {
		if (!(signal[i] > signal[i - 1] && signal[i] >= signal[i + 1])) continue;
		// Prominence check: must exceed the minimum value in a window
		// behind by at least `prominence`.
		const left = Math.max(0, i - minSeparation);
		let leftMin = signal[i];
		for (let j = left; j < i; j++) if (signal[j] < leftMin) leftMin = signal[j];
		if (signal[i] - leftMin < prominence) continue;

		if (peaks.length > 0 && i - peaks[peaks.length - 1] < minSeparation) {
			if (signal[i] > signal[peaks[peaks.length - 1]]) {
				peaks[peaks.length - 1] = i;
			}
			continue;
		}
		peaks.push(i);
	}
	return peaks;
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
