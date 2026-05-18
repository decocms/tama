import { describe, expect, test } from "bun:test";
import { fft, findPSDPeak, welchPSD } from "./breathing/fft.ts";
import { buildPyramid, detectShiTomasi, lkPyramid } from "./breathing/lk.ts";
import { computeQuality, detectExposureJump } from "./breathing/quality.ts";
import {
	analyzeIBI,
	bandpass,
	findPeaks,
	hampelFilter,
	stddev,
} from "./breathing/signal.ts";
import { type BreathingFrame, createBreathingEstimator } from "./breathing.ts";

describe("fft", () => {
	test("inverse of itself recovers input within 1e-3", () => {
		const N = 64;
		const real = new Float32Array(N);
		const imag = new Float32Array(N);
		for (let i = 0; i < N; i++) {
			real[i] = Math.sin((2 * Math.PI * 5 * i) / N);
		}
		const origReal = Float32Array.from(real);
		fft(real, imag);
		// Inverse: conjugate, FFT, conjugate, scale by 1/N.
		for (let i = 0; i < N; i++) imag[i] = -imag[i];
		fft(real, imag);
		for (let i = 0; i < N; i++) {
			real[i] /= N;
			imag[i] = -imag[i] / N;
		}
		let maxErr = 0;
		for (let i = 0; i < N; i++) {
			maxErr = Math.max(maxErr, Math.abs(real[i] - origReal[i]));
		}
		expect(maxErr).toBeLessThan(1e-3);
	});

	test("welch PSD locates a pure tone within one bin", () => {
		const fs = 30;
		const N = 600;
		const trueFreq = 0.4;
		const signal = new Float32Array(N);
		for (let i = 0; i < N; i++) {
			signal[i] = Math.sin((2 * Math.PI * trueFreq * i) / fs);
		}
		const { freq, psd } = welchPSD(signal, fs, {
			segmentLength: 256,
			overlap: 0.5,
		});
		const peak = findPSDPeak(freq, psd, 0.05, 1.5);
		expect(peak).not.toBeNull();
		expect(Math.abs((peak?.freq ?? 0) - trueFreq)).toBeLessThan(0.05);
		expect(peak?.snr ?? 0).toBeGreaterThan(10);
	});

	test("welch peak refinement gives sub-bin precision on noisy tone", () => {
		const fs = 30;
		const N = 600;
		const trueFreq = 0.37;
		const signal = new Float32Array(N);
		for (let i = 0; i < N; i++) {
			signal[i] =
				Math.sin((2 * Math.PI * trueFreq * i) / fs) +
				(Math.random() - 0.5) * 0.3;
		}
		const { freq, psd } = welchPSD(signal, fs, { segmentLength: 256 });
		const peak = findPSDPeak(freq, psd, 0.05, 1.5);
		expect(peak).not.toBeNull();
		// Bin width is fs/N = 30/256 = ~0.117 Hz; refinement should beat that.
		expect(Math.abs((peak?.freq ?? 0) - trueFreq)).toBeLessThan(0.04);
	});
});

describe("lucas-kanade", () => {
	test("recovers known whole-pixel translation", () => {
		const W = 64;
		const H = 64;
		const prev = makeCheckerboard(W, H, 8);
		const curr = translateImage(prev, W, H, 2, 3);
		const prevPyr = buildPyramid(prev, W, H, 2);
		const currPyr = buildPyramid(curr, W, H, 2);
		const result = lkPyramid(prevPyr, currPyr, 32, 32);
		expect(result.converged).toBe(true);
		expect(Math.abs(result.dx - 2)).toBeLessThan(0.4);
		expect(Math.abs(result.dy - 3)).toBeLessThan(0.4);
	});

	test("recovers sub-pixel vertical translation", () => {
		const W = 64;
		const H = 64;
		const prev = makeGradient(W, H);
		const curr = translateImageSubpixel(prev, W, H, 0, 0.5);
		const prevPyr = buildPyramid(prev, W, H, 2);
		const currPyr = buildPyramid(curr, W, H, 2);
		const result = lkPyramid(prevPyr, currPyr, 32, 32);
		expect(result.converged).toBe(true);
		expect(Math.abs(result.dy - 0.5)).toBeLessThan(0.2);
	});

	test("Shi-Tomasi finds corners on a checkerboard", () => {
		const W = 80;
		const H = 60;
		const buf = makeCheckerboard(W, H, 8);
		const features = detectShiTomasi(buf, W, H, 30);
		expect(features.length).toBeGreaterThan(10);
		expect(features.length).toBeLessThanOrEqual(30);
		// All inside bounds with min separation.
		for (const f of features) {
			expect(f.x).toBeGreaterThanOrEqual(4);
			expect(f.x).toBeLessThan(W - 4);
			expect(f.y).toBeGreaterThanOrEqual(4);
			expect(f.y).toBeLessThan(H - 4);
		}
	});

	test("Shi-Tomasi returns zero features on flat image", () => {
		const W = 40;
		const H = 30;
		const buf = new Uint8Array(W * H);
		buf.fill(120);
		const features = detectShiTomasi(buf, W, H, 30);
		expect(features.length).toBe(0);
	});
});

describe("signal utilities", () => {
	test("hampel filter replaces spikes", () => {
		const x = new Float32Array(50);
		for (let i = 0; i < 50; i++) x[i] = Math.sin(i / 5);
		x[25] = 100;
		const out = hampelFilter(x, 7, 3);
		expect(Math.abs(out[25])).toBeLessThan(2);
	});

	test("bandpass attenuates out-of-band tone", () => {
		const fs = 30;
		const N = 600;
		const signal = new Float32Array(N);
		for (let i = 0; i < N; i++) {
			signal[i] =
				Math.sin((2 * Math.PI * 0.4 * i) / fs) + // in-band
				Math.sin((2 * Math.PI * 8 * i) / fs); // out-of-band tremor
		}
		const filtered = bandpass(signal, fs, 0.08, 1.5);
		// After steady-state, filtered should be dominated by 0.4 Hz.
		// Energy of in-band-only signal vs noise:
		const tail = filtered.subarray(200);
		const energyIn = stddev(tail);
		expect(energyIn).toBeGreaterThan(0.4);
		expect(energyIn).toBeLessThan(1.0); // far less than the unfiltered ~1.4
	});

	test("findPeaks locates expected peaks in clean sine", () => {
		const fs = 30;
		const N = 600;
		const signal = new Float32Array(N);
		for (let i = 0; i < N; i++) {
			signal[i] = Math.sin((2 * Math.PI * 0.5 * i) / fs);
		}
		const peaks = findPeaks(signal, 30, 0.5);
		// 20 s at 0.5 Hz = 10 cycles, expect ~10 peaks.
		expect(peaks.length).toBeGreaterThanOrEqual(9);
		expect(peaks.length).toBeLessThanOrEqual(11);
	});

	test("analyzeIBI gives correct BPM for evenly-spaced peaks", () => {
		const fs = 30;
		const peaks = [60, 120, 180, 240, 300];
		const ibi = analyzeIBI(peaks, fs);
		expect(ibi.meanBpm).toBeCloseTo(30, 0);
		expect(ibi.regularityCV).toBeCloseTo(0, 5);
	});
});

describe("quality", () => {
	test("score is 0 when nothing works", () => {
		const q = computeQuality({
			spectralSnr: 1,
			spectralPeakNormalized: 0,
			regularityCV: 1,
			aliveFeatures: 0,
			targetFeatures: 30,
			shakeFraction: 1,
			exposureJumpRecent: true,
			cycleCount: 0,
		});
		expect(q.total).toBeLessThan(20);
	});

	test("score is high when signals are strong", () => {
		const q = computeQuality({
			spectralSnr: 50,
			spectralPeakNormalized: 0.4,
			regularityCV: 0.05,
			aliveFeatures: 28,
			targetFeatures: 30,
			shakeFraction: 0,
			exposureJumpRecent: false,
			cycleCount: 10,
		});
		expect(q.total).toBeGreaterThan(80);
	});

	test("detectExposureJump triggers on a brightness jump", () => {
		expect(detectExposureJump([120, 121, 120, 122, 121], 135)).toBe(true);
		expect(detectExposureJump([120, 121, 120, 122, 121], 121)).toBe(false);
	});
});

describe("integrated estimator", () => {
	test("recovers ~30 BPM from a synthetic textured ROI moving vertically by sub-pixel sine", () => {
		const fs = 30;
		const W = 80;
		const H = 60;
		const est = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 22,
		});
		const base = makeCheckerboard(W, H, 6);
		const rgba = new Uint8ClampedArray(W * H * 4);
		const tmp = new Uint8Array(W * H);
		const seconds = 22;
		for (let i = 0; i < fs * seconds; i++) {
			const yShift = 0.7 * Math.sin((2 * Math.PI * 0.5 * i) / fs);
			translateImageSubpixelInto(base, W, H, 0, yShift, tmp);
			for (let p = 0, q = 0; p < W * H; p++, q += 4) {
				rgba[q] = tmp[p];
				rgba[q + 1] = tmp[p];
				rgba[q + 2] = tmp[p];
				rgba[q + 3] = 255;
			}
			const frame: BreathingFrame = {
				roiRgba: rgba,
				roiWidth: W,
				roiHeight: H,
				globalDiff: 0.01,
				globalMeanLuma: 128,
			};
			est.feed(frame);
		}
		const out = est.estimate();
		expect(out.bpm).not.toBeNull();
		expect(Math.abs((out.bpm ?? 0) - 30)).toBeLessThan(3);
		expect(out.activeSignal).toBe("lk");
		expect(out.quality.total).toBeGreaterThan(40);
	});

	test("recovers 20 BPM from a sub-pixel moving horizontal edge", () => {
		const fs = 30;
		const W = 80;
		const H = 60;
		const est = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 22,
		});
		const rgba = new Uint8ClampedArray(W * H * 4);
		const seconds = 22;
		for (let i = 0; i < fs * seconds; i++) {
			const yEdge = 20 + 0.5 * Math.sin((2 * Math.PI * (1 / 3) * i) / fs);
			const tmp = syntheticEdge(yEdge, W, H);
			for (let p = 0, q = 0; p < W * H; p++, q += 4) {
				rgba[q] = tmp[p];
				rgba[q + 1] = tmp[p];
				rgba[q + 2] = tmp[p];
				rgba[q + 3] = 255;
			}
			est.feed({
				roiRgba: rgba,
				roiWidth: W,
				roiHeight: H,
				globalDiff: 0.01,
				globalMeanLuma: 128,
			});
		}
		const out = est.estimate();
		expect(out.bpm).not.toBeNull();
		expect(Math.abs((out.bpm ?? 0) - 20)).toBeLessThan(4);
	});

	test("camera-shake gate drops samples and BPM stays stable", () => {
		const fs = 30;
		const W = 80;
		const H = 60;
		const est = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 22,
		});
		const base = makeCheckerboard(W, H, 6);
		const rgba = new Uint8ClampedArray(W * H * 4);
		const tmp = new Uint8Array(W * H);
		const seconds = 20;
		for (let i = 0; i < fs * seconds; i++) {
			const yShift = 0.7 * Math.sin((2 * Math.PI * 0.5 * i) / fs);
			translateImageSubpixelInto(base, W, H, 0, yShift, tmp);
			for (let p = 0, q = 0; p < W * H; p++, q += 4) {
				rgba[q] = tmp[p];
				rgba[q + 1] = tmp[p];
				rgba[q + 2] = tmp[p];
				rgba[q + 3] = 255;
			}
			est.feed({
				roiRgba: rgba,
				roiWidth: W,
				roiHeight: H,
				globalDiff: 0.01,
				globalMeanLuma: 128,
			});
		}
		const beforeShake = est.estimate();
		const samplesBefore = beforeShake.samplesReady;
		expect(beforeShake.shakeRecent).toBe(false);

		// Inject 1.5 s of shake.
		for (let i = 0; i < Math.round(fs * 1.5); i++) {
			est.feed({
				roiRgba: rgba,
				roiWidth: W,
				roiHeight: H,
				globalDiff: 200,
				globalMeanLuma: 128,
			});
		}
		const duringShake = est.estimate();
		expect(duringShake.shakeRecent).toBe(true);
		expect(duringShake.samplesReady).toBeLessThan(samplesBefore + 10);
		expect(duringShake.bpm).not.toBeNull();
		expect(Math.abs((duringShake.bpm ?? 0) - 30)).toBeLessThan(4);
	});

	test("reports null BPM and zero quality before any data", () => {
		const est = createBreathingEstimator({
			sampleRateHz: 30,
			bufferSeconds: 20,
		});
		const out = est.estimate();
		expect(out.bpm).toBeNull();
		expect(out.quality.total).toBe(0);
	});
});

// ---------------- test helpers ----------------

function makeCheckerboard(w: number, h: number, square: number): Uint8Array {
	const buf = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const on = (((x / square) | 0) + ((y / square) | 0)) % 2 === 0;
			buf[y * w + x] = on ? 200 : 50;
		}
	}
	return buf;
}

function makeGradient(w: number, h: number): Uint8Array {
	const buf = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			buf[y * w + x] = Math.min(
				255,
				Math.max(0, Math.round(20 + 200 * (y / h) + 30 * (x / w))),
			);
		}
	}
	return buf;
}

function translateImage(
	src: Uint8Array,
	w: number,
	h: number,
	dx: number,
	dy: number,
): Uint8Array {
	const out = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const sx = Math.max(0, Math.min(w - 1, x - Math.round(dx)));
			const sy = Math.max(0, Math.min(h - 1, y - Math.round(dy)));
			out[y * w + x] = src[sy * w + sx];
		}
	}
	return out;
}

function translateImageSubpixel(
	src: Uint8Array,
	w: number,
	h: number,
	dx: number,
	dy: number,
): Uint8Array {
	const out = new Uint8Array(w * h);
	translateImageSubpixelInto(src, w, h, dx, dy, out);
	return out;
}

function translateImageSubpixelInto(
	src: Uint8Array,
	w: number,
	h: number,
	dx: number,
	dy: number,
	out: Uint8Array,
) {
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const sx = x - dx;
			const sy = y - dy;
			if (sx < 0 || sx > w - 1 || sy < 0 || sy > h - 1) {
				out[y * w + x] = src[y * w + x];
				continue;
			}
			const xi = Math.floor(sx);
			const yi = Math.floor(sy);
			const fx = sx - xi;
			const fy = sy - yi;
			const xi1 = Math.min(xi + 1, w - 1);
			const yi1 = Math.min(yi + 1, h - 1);
			const a = src[yi * w + xi];
			const b = src[yi * w + xi1];
			const c = src[yi1 * w + xi];
			const d = src[yi1 * w + xi1];
			const v =
				a * (1 - fx) * (1 - fy) +
				b * fx * (1 - fy) +
				c * (1 - fx) * fy +
				d * fx * fy;
			out[y * w + x] = Math.round(v);
		}
	}
}

function syntheticEdge(yEdge: number, w: number, h: number): Uint8Array {
	const buf = new Uint8Array(w * h);
	// Smooth linear ramp over a 4-pixel transition zone — avoids the
	// discontinuity that a 1-row anti-aliased edge introduces at integer
	// yEdge crossings (which otherwise injects 2× harmonic energy).
	const halfWidth = 2;
	for (let y = 0; y < h; y++) {
		const d = y - yEdge;
		let v: number;
		if (d < -halfWidth) v = 30;
		else if (d > halfWidth) v = 200;
		else v = Math.round(30 + 170 * ((d + halfWidth) / (2 * halfWidth)));
		for (let x = 0; x < w; x++) buf[y * w + x] = v;
	}
	return buf;
}
