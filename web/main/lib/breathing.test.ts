import { describe, expect, test } from "bun:test";
import { fft, findPSDPeak, welchPSD } from "./breathing/fft.ts";
import { computeQuality, detectExposureJump } from "./breathing/quality.ts";
import {
	createRowProjector,
	measureVerticalShift,
} from "./breathing/row-projection.ts";
import {
	analyzeIBI,
	bandpass,
	findCycles,
	hampelFilter,
	stddev,
} from "./breathing/signal.ts";
import {
	bpmMeasurementVariance,
	createBpmTracker,
} from "./breathing/tracker.ts";
import { createBreathingEstimator } from "./breathing.ts";

describe("fft", () => {
	test("inverse of itself recovers input within 1e-3", () => {
		const N = 64;
		const real = new Float32Array(N);
		const imag = new Float32Array(N);
		for (let i = 0; i < N; i++) {
			real[i] = Math.sin((2 * Math.PI * 5 * i) / N);
		}
		const orig = Float32Array.from(real);
		fft(real, imag);
		for (let i = 0; i < N; i++) imag[i] = -imag[i];
		fft(real, imag);
		for (let i = 0; i < N; i++) {
			real[i] /= N;
			imag[i] = -imag[i] / N;
		}
		let maxErr = 0;
		for (let i = 0; i < N; i++)
			maxErr = Math.max(maxErr, Math.abs(real[i] - orig[i]));
		expect(maxErr).toBeLessThan(1e-3);
	});

	test("welch PSD recovers a tone with sub-bin precision", () => {
		const fs = 30;
		const N = 600;
		const trueFreq = 0.37;
		const sig = new Float32Array(N);
		for (let i = 0; i < N; i++) {
			sig[i] = Math.sin((2 * Math.PI * trueFreq * i) / fs);
		}
		const { freq, psd } = welchPSD(sig, fs, { segmentLength: 256 });
		const peak = findPSDPeak(freq, psd, 0.05, 1.5);
		expect(peak).not.toBeNull();
		expect(Math.abs((peak?.freq ?? 0) - trueFreq)).toBeLessThan(0.04);
	});

	test("refinePeakFrequency does not extrapolate when concave-up (DC leak)", () => {
		// Construct a PSD with a fake "peak" at bin 1 but bin 0 (DC) much higher.
		// Without the concave-up guard the refined freq would dive well below bin 1.
		const psd = new Float32Array([10, 2, 1, 0.5, 0.3]);
		const freq = new Float32Array([0, 0.1, 0.2, 0.3, 0.4]);
		const peak = findPSDPeak(freq, psd, 0.05, 0.5);
		expect(peak).not.toBeNull();
		// Peak should be at bin 1 (freq=0.1) with no negative-direction refinement.
		expect(peak?.freq ?? 0).toBeGreaterThanOrEqual(0.1);
		expect(peak?.freq ?? 0).toBeLessThan(0.15);
	});
});

describe("row-projection", () => {
	test("measureVerticalShift recovers a known sub-pixel shift", () => {
		const N = 60;
		const prev = makeProfile(N, 20.0);
		const curr = makeProfile(N, 20.3);
		const r = measureVerticalShift(prev, curr, 3);
		expect(Math.abs(r.dy - 0.3)).toBeLessThan(0.12);
		expect(r.confidence).toBeGreaterThan(0.9);
	});

	test("measureVerticalShift handles 1-pixel shifts robustly", () => {
		const N = 60;
		const prev = makeProfile(N, 25.0);
		const curr = makeProfile(N, 26.0);
		const r = measureVerticalShift(prev, curr, 3);
		expect(Math.abs(r.dy - 1.0)).toBeLessThan(0.15);
	});

	test("measureVerticalShift returns zero for identical profiles", () => {
		const N = 60;
		const prev = makeProfile(N, 30.0);
		const curr = makeProfile(N, 30.0);
		const r = measureVerticalShift(prev, curr, 3);
		expect(Math.abs(r.dy)).toBeLessThan(0.05);
		expect(r.confidence).toBeGreaterThan(0.99);
	});

	test("measureVerticalShift gives near-zero confidence on flat input", () => {
		const N = 60;
		const flat = new Float32Array(N);
		flat.fill(120);
		const r = measureVerticalShift(flat, flat, 3);
		expect(r.confidence).toBe(0);
	});

	test("projector processes a 2D ROI and tracks cumulative motion", () => {
		const W = 80;
		const H = 60;
		const proj = createRowProjector(W, H);
		const buf = new Uint8Array(W * H);
		fillSyntheticEdge(buf, W, H, 20.0);
		proj.process(buf);
		fillSyntheticEdge(buf, W, H, 20.4);
		const r = proj.process(buf);
		expect(r).not.toBeNull();
		expect(Math.abs((r?.dy ?? 0) - 0.4)).toBeLessThan(0.2);
	});
});

describe("tracker", () => {
	test("seeds on the first measurement and locks after consistent inputs", () => {
		const t = createBpmTracker({ lockFrames: 3, lockVariance: 4 });
		t.update(30, 1);
		expect(t.getState().initialized).toBe(true);
		expect(t.getState().isLocked).toBe(false);
		for (let i = 0; i < 10; i++) t.update(30 + (Math.random() - 0.5) * 0.5, 1);
		const s = t.getState();
		expect(Math.abs(s.bpm - 30)).toBeLessThan(1);
		expect(s.isLocked).toBe(true);
	});

	test("rejects outliers and keeps state stable", () => {
		const t = createBpmTracker();
		for (let i = 0; i < 12; i++) t.update(30, 1);
		const beforeBpm = t.getState().bpm;
		// A single outlier at 60 BPM should be ignored entirely.
		t.update(60, 1);
		const afterBpm = t.getState().bpm;
		expect(Math.abs(afterBpm - beforeBpm)).toBeLessThan(0.5);
	});

	test("sustained disagreement triggers state reset", () => {
		const t = createBpmTracker({ resetStreak: 4 });
		for (let i = 0; i < 12; i++) t.update(30, 1);
		expect(t.getState().bpm).toBeCloseTo(30, 0);
		// 5 outliers in a row at 55 BPM — beyond resetStreak.
		for (let i = 0; i < 5; i++) t.update(55, 1);
		const s = t.getState();
		expect(s.bpm).toBeCloseTo(55, 0);
		expect(s.isLocked).toBe(false);
	});

	test("variance increases with low SNR / quality", () => {
		const high = bpmMeasurementVariance(40, 80);
		const low = bpmMeasurementVariance(2, 30);
		expect(low).toBeGreaterThan(high * 5);
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
		const sig = new Float32Array(N);
		for (let i = 0; i < N; i++) {
			sig[i] =
				Math.sin((2 * Math.PI * 0.4 * i) / fs) +
				Math.sin((2 * Math.PI * 8 * i) / fs);
		}
		const filtered = bandpass(sig, fs, 0.08, 1.5);
		const tail = filtered.subarray(200);
		expect(stddev(tail)).toBeLessThan(1.0);
	});

	test("findCycles recovers expected cycle count from clean sine", () => {
		const fs = 30;
		const N = 600;
		const sig = new Float32Array(N);
		for (let i = 0; i < N; i++) sig[i] = Math.sin((2 * Math.PI * 0.5 * i) / fs);
		const { zeroCrossings, peakIndices } = findCycles(sig, 15, 0.1);
		// 20 s at 0.5 Hz = 10 cycles → 10 positive-going crossings.
		expect(zeroCrossings.length).toBeGreaterThanOrEqual(9);
		expect(zeroCrossings.length).toBeLessThanOrEqual(11);
		expect(peakIndices.length).toBe(zeroCrossings.length);
	});

	test("findCycles isn't fooled by noise flicker around zero", () => {
		const fs = 30;
		const N = 600;
		const sig = new Float32Array(N);
		for (let i = 0; i < N; i++) {
			sig[i] =
				Math.sin((2 * Math.PI * 0.5 * i) / fs) + (Math.random() - 0.5) * 0.4;
		}
		const sd = stddev(sig);
		const { zeroCrossings } = findCycles(sig, 15, sd * 0.15);
		// Still ~10 cycles even with substantial noise.
		expect(zeroCrossings.length).toBeGreaterThanOrEqual(8);
		expect(zeroCrossings.length).toBeLessThanOrEqual(12);
	});

	test("analyzeIBI yields correct BPM for evenly-spaced peaks", () => {
		const ibi = analyzeIBI([60, 120, 180, 240, 300], 30);
		expect(ibi.meanBpm).toBeCloseTo(30, 0);
		expect(ibi.regularityCV).toBeCloseTo(0, 5);
	});
});

describe("quality", () => {
	test("low total when nothing works", () => {
		const q = computeQuality({
			spectralSnr: 1,
			spectralPeakNormalized: 0,
			regularityCV: 1,
			aliveFeatures: 0,
			targetFeatures: 600,
			shakeFraction: 1,
			exposureJumpRecent: true,
			cycleCount: 0,
		});
		expect(q.total).toBeLessThan(20);
	});

	test("high total when signals are strong", () => {
		const q = computeQuality({
			spectralSnr: 50,
			spectralPeakNormalized: 0.4,
			regularityCV: 0.05,
			aliveFeatures: 600,
			targetFeatures: 600,
			shakeFraction: 0,
			exposureJumpRecent: false,
			cycleCount: 10,
		});
		expect(q.total).toBeGreaterThan(80);
	});

	test("exposure jump detection triggers on a brightness step", () => {
		expect(detectExposureJump([120, 121, 120, 122, 121], 135)).toBe(true);
		expect(detectExposureJump([120, 121, 120, 122, 121], 121)).toBe(false);
	});
});

describe("integrated estimator", () => {
	test("locks onto 30 BPM from a sub-pixel moving textured ROI", () => {
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
		const estimateEvery = Math.round(fs / 4); // 4 Hz like the UI does
		let out = est.estimate();
		for (let i = 0; i < fs * seconds; i++) {
			const yShift = 0.6 * Math.sin((2 * Math.PI * 0.5 * i) / fs);
			translateSubpixel(base, W, H, yShift, tmp);
			lumaToRgba(tmp, rgba);
			est.feed({
				roiRgba: rgba,
				roiWidth: W,
				roiHeight: H,
				globalDiff: 0.01,
				globalMeanLuma: 128,
			});
			if (i > 0 && i % estimateEvery === 0) out = est.estimate();
		}
		out = est.estimate();
		expect(out.bpm).not.toBeNull();
		expect(Math.abs((out.bpm ?? 0) - 30)).toBeLessThan(2);
		expect(out.isLocked).toBe(true);
		expect(out.displayState).toBe("locked");
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
		const tmp = new Uint8Array(W * H);
		const seconds = 22;
		for (let i = 0; i < fs * seconds; i++) {
			const yEdge = 20 + 0.5 * Math.sin((2 * Math.PI * (1 / 3) * i) / fs);
			fillSyntheticEdge(tmp, W, H, yEdge);
			lumaToRgba(tmp, rgba);
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
		expect(Math.abs((out.bpm ?? 0) - 20)).toBeLessThan(3);
	});

	test("rejects 3 BPM from DC leak — never displays sub-5-BPM", () => {
		const fs = 30;
		const W = 80;
		const H = 60;
		const est = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 22,
		});
		// Slow linear drift only — no real breathing.
		const base = makeCheckerboard(W, H, 6);
		const rgba = new Uint8ClampedArray(W * H * 4);
		const tmp = new Uint8Array(W * H);
		for (let i = 0; i < fs * 22; i++) {
			const drift = (i / fs) * 0.05;
			translateSubpixel(base, W, H, drift, tmp);
			lumaToRgba(tmp, rgba);
			est.feed({
				roiRgba: rgba,
				roiWidth: W,
				roiHeight: H,
				globalDiff: 0.01,
				globalMeanLuma: 128,
			});
		}
		const out = est.estimate();
		// Either no detection or a value within the legal band — never an
		// absurd 3 BPM from DC leak.
		if (out.bpm != null) {
			expect(out.bpm).toBeGreaterThanOrEqual(5);
		}
	});

	test("camera shake doesn't dislodge a locked BPM", () => {
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
		const estimateEvery = Math.round(fs / 4);
		// 22s of clean breathing → lock.
		for (let i = 0; i < fs * 22; i++) {
			const yShift = 0.6 * Math.sin((2 * Math.PI * 0.5 * i) / fs);
			translateSubpixel(base, W, H, yShift, tmp);
			lumaToRgba(tmp, rgba);
			est.feed({
				roiRgba: rgba,
				roiWidth: W,
				roiHeight: H,
				globalDiff: 0.01,
				globalMeanLuma: 128,
			});
			if (i > 0 && i % estimateEvery === 0) est.estimate();
		}
		const locked = est.estimate();
		expect(locked.isLocked).toBe(true);
		const lockedBpm = locked.bpm ?? 0;

		// Inject 1.5s shake. The shake gate should drop most frames; what
		// gets through shouldn't dislodge the lock.
		for (let i = 0; i < Math.round(fs * 1.5); i++) {
			est.feed({
				roiRgba: rgba,
				roiWidth: W,
				roiHeight: H,
				globalDiff: 200,
				globalMeanLuma: 128,
			});
			if (i % estimateEvery === 0) est.estimate();
		}
		const after = est.estimate();
		expect(after.shakeRecent).toBe(true);
		expect(Math.abs((after.bpm ?? 0) - lockedBpm)).toBeLessThan(2);
	});

	test("reports searching state before MIN_ESTIMATE_SECONDS", () => {
		const est = createBreathingEstimator({
			sampleRateHz: 30,
			bufferSeconds: 20,
		});
		const out = est.estimate();
		expect(out.bpm).toBeNull();
		expect(out.displayState).toBe("uninitialized");
	});
});

// ---------------- test helpers ----------------

function makeProfile(N: number, peakY: number): Float32Array {
	const out = new Float32Array(N);
	for (let y = 0; y < N; y++) {
		// Gaussian-like profile peaked at peakY with sub-pixel sensitivity.
		const d = y - peakY;
		out[y] = 200 * Math.exp(-(d * d) / 40) + 30;
	}
	return out;
}

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

function translateSubpixel(
	src: Uint8Array,
	w: number,
	h: number,
	dy: number,
	out: Uint8Array,
) {
	for (let y = 0; y < h; y++) {
		const sy = y - dy;
		const yi = Math.floor(sy);
		const fy = sy - yi;
		const y0 = Math.max(0, Math.min(h - 1, yi));
		const y1 = Math.max(0, Math.min(h - 1, yi + 1));
		for (let x = 0; x < w; x++) {
			const a = src[y0 * w + x];
			const b = src[y1 * w + x];
			out[y * w + x] = Math.round(a * (1 - fy) + b * fy);
		}
	}
}

function fillSyntheticEdge(
	out: Uint8Array,
	w: number,
	h: number,
	yEdge: number,
) {
	const halfWidth = 2;
	for (let y = 0; y < h; y++) {
		const d = y - yEdge;
		let v: number;
		if (d < -halfWidth) v = 30;
		else if (d > halfWidth) v = 200;
		else v = Math.round(30 + 170 * ((d + halfWidth) / (2 * halfWidth)));
		for (let x = 0; x < w; x++) out[y * w + x] = v;
	}
}

function lumaToRgba(luma: Uint8Array, rgba: Uint8ClampedArray) {
	for (let p = 0, q = 0; p < luma.length; p++, q += 4) {
		rgba[q] = luma[p];
		rgba[q + 1] = luma[p];
		rgba[q + 2] = luma[p];
		rgba[q + 3] = 255;
	}
}
