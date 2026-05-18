/**
 * In-place radix-2 Cooley–Tukey FFT. `real` and `imag` must have length N
 * where N is a power of 2.
 */
export function fft(real: Float32Array, imag: Float32Array): void {
	const N = real.length;
	if (N <= 1) return;
	if ((N & (N - 1)) !== 0) {
		throw new Error(`FFT length ${N} is not a power of 2`);
	}

	// Bit-reversal permutation.
	let j = 0;
	for (let i = 1; i < N; i++) {
		let bit = N >> 1;
		while (j & bit) {
			j ^= bit;
			bit >>= 1;
		}
		j ^= bit;
		if (i < j) {
			const tr = real[i];
			real[i] = real[j];
			real[j] = tr;
			const ti = imag[i];
			imag[i] = imag[j];
			imag[j] = ti;
		}
	}

	// Cooley–Tukey butterflies.
	for (let len = 2; len <= N; len <<= 1) {
		const halfLen = len >> 1;
		const ang = (-2 * Math.PI) / len;
		const wStepR = Math.cos(ang);
		const wStepI = Math.sin(ang);
		for (let i = 0; i < N; i += len) {
			let wr = 1;
			let wi = 0;
			for (let k = 0; k < halfLen; k++) {
				const eR = real[i + k];
				const eI = imag[i + k];
				const oR = real[i + k + halfLen] * wr - imag[i + k + halfLen] * wi;
				const oI = real[i + k + halfLen] * wi + imag[i + k + halfLen] * wr;
				real[i + k] = eR + oR;
				imag[i + k] = eI + oI;
				real[i + k + halfLen] = eR - oR;
				imag[i + k + halfLen] = eI - oI;
				const nr = wr * wStepR - wi * wStepI;
				wi = wr * wStepI + wi * wStepR;
				wr = nr;
			}
		}
	}
}

export function nextPow2(n: number): number {
	let p = 1;
	while (p < n) p <<= 1;
	return p;
}

export function hannWindow(N: number): Float32Array {
	const w = new Float32Array(N);
	for (let i = 0; i < N; i++) {
		w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
	}
	return w;
}

export type WelchOptions = {
	segmentLength?: number;
	overlap?: number;
};

/**
 * Welch's periodogram. Returns one-sided PSD over [0, fs/2]. Averages
 * multiple overlapping Hann-windowed segments; falls back gracefully to a
 * single windowed FFT (zero-padded) when the signal is shorter than one
 * segment.
 */
export function welchPSD(
	signal: Float32Array,
	fs: number,
	options: WelchOptions = {},
): { freq: Float32Array; psd: Float32Array } {
	const requested = options.segmentLength ?? 256;
	const overlap = options.overlap ?? 0.5;
	const N = nextPow2(Math.min(requested, Math.max(64, signal.length)));
	const step = Math.max(1, Math.floor(N * (1 - overlap)));
	const numSegments =
		signal.length >= N ? Math.floor((signal.length - N) / step) + 1 : 1;

	const window = hannWindow(N);
	let windowEnergy = 0;
	for (let i = 0; i < N; i++) windowEnergy += window[i] * window[i];

	const psd = new Float32Array(N / 2 + 1);
	const real = new Float32Array(N);
	const imag = new Float32Array(N);

	for (let s = 0; s < numSegments; s++) {
		const start = s * step;
		const available = Math.min(N, signal.length - start);
		for (let i = 0; i < N; i++) {
			real[i] = i < available ? signal[start + i] * window[i] : 0;
			imag[i] = 0;
		}
		fft(real, imag);
		for (let i = 0; i <= N / 2; i++) {
			psd[i] += real[i] * real[i] + imag[i] * imag[i];
		}
	}

	const norm = 1 / (numSegments * windowEnergy * fs);
	for (let i = 0; i < psd.length; i++) {
		psd[i] *= norm;
		if (i > 0 && i < psd.length - 1) psd[i] *= 2;
	}

	const freq = new Float32Array(psd.length);
	for (let i = 0; i < freq.length; i++) freq[i] = (i * fs) / N;
	return { freq, psd };
}

/**
 * Sub-bin spectral peak refinement via parabolic interpolation on log
 * magnitude. Works well for narrowband peaks after Hann windowing.
 */
export function refinePeakFrequency(
	psd: Float32Array,
	freq: Float32Array,
	peakIdx: number,
): number {
	if (peakIdx <= 0 || peakIdx >= psd.length - 1) return freq[peakIdx];
	const ym1 = Math.log(Math.max(psd[peakIdx - 1], 1e-20));
	const y0 = Math.log(Math.max(psd[peakIdx], 1e-20));
	const yp1 = Math.log(Math.max(psd[peakIdx + 1], 1e-20));
	const denom = ym1 - 2 * y0 + yp1;
	if (denom === 0) return freq[peakIdx];
	const delta = (0.5 * (ym1 - yp1)) / denom;
	const binWidth = freq[1] - freq[0];
	return freq[peakIdx] + delta * binWidth;
}

/**
 * Find the strongest PSD peak in [minHz, maxHz]. Returns null if the band
 * is empty. SNR is computed as peak power / median power in the band, a
 * robust noise-floor proxy.
 */
export function findPSDPeak(
	freq: Float32Array,
	psd: Float32Array,
	minHz: number,
	maxHz: number,
): {
	bin: number;
	freq: number;
	power: number;
	snr: number;
	bandPower: number;
} | null {
	let peakIdx = -1;
	let peakPower = -Infinity;
	const bandPowers: number[] = [];
	for (let i = 0; i < freq.length; i++) {
		if (freq[i] >= minHz && freq[i] <= maxHz) {
			bandPowers.push(psd[i]);
			if (psd[i] > peakPower) {
				peakPower = psd[i];
				peakIdx = i;
			}
		}
	}
	if (peakIdx < 0 || bandPowers.length === 0) return null;
	const refined = refinePeakFrequency(psd, freq, peakIdx);
	const sorted = bandPowers.slice().sort((a, b) => a - b);
	const median = sorted[sorted.length >> 1];
	const snr = median > 0 ? peakPower / median : peakPower;
	const bandPower = bandPowers.reduce((a, b) => a + b, 0);
	return {
		bin: peakIdx,
		freq: refined,
		power: peakPower,
		snr,
		bandPower,
	};
}
