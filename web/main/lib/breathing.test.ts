import { describe, expect, test } from "bun:test";
import { createBlockMatcher, nccAtShift2D } from "./breathing/block-match.ts";
import { fft, findPSDPeak, welchPSD } from "./breathing/fft.ts";
import { computeQuality, detectExposureJump } from "./breathing/quality.ts";
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

describe("block-match", () => {
	test("nccAtShift2D returns ~1 when shift matches the true offset", () => {
		const W = 32;
		const H = 32;
		// Build a textured template (checkerboard-ish, ensures variance).
		const tmpl = new Float32Array(W * H);
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				tmpl[y * W + x] = (((x / 4) | 0) + ((y / 4) | 0)) % 2 === 0 ? 200 : 50;
			}
		}
		// curr = tmpl shifted DOWN by 2 rows (so we expect dy = +2 to align).
		const curr = new Uint8Array(W * H);
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const srcY = y - 2;
				if (srcY < 0 || srcY >= H) curr[y * W + x] = 0;
				else curr[y * W + x] = tmpl[srcY * W + x];
			}
		}
		const nccAt2 = nccAtShift2D(tmpl, curr, W, H, 2);
		const nccAt0 = nccAtShift2D(tmpl, curr, W, H, 0);
		expect(nccAt2).toBeGreaterThan(0.95);
		expect(nccAt0).toBeLessThan(nccAt2);
	});

	test("matcher recovers a known sub-pixel vertical shift on a textured ROI", () => {
		const W = 40;
		const H = 40;
		// Aperiodic blob pattern — three Gaussian bumps at unique positions.
		// A periodic texture (checkerboard) would alias and let NCC peak at
		// any multiple of the period; blobs give a unique peak at the true
		// shift.
		const base = blobTexture(W, H);
		const matcher = createBlockMatcher(W, H);
		matcher.process(base);
		const shifted = subpixelShifted(base, W, H, 0.4);
		const r = matcher.process(shifted);
		expect(r).not.toBeNull();
		expect(Math.abs((r?.dy ?? 0) - 0.4)).toBeLessThan(0.2);
	});

	test("matcher also tracks a horizontal-edge ROI (no regression vs row-projection)", () => {
		const W = 32;
		const H = 60;
		const buf1 = new Uint8Array(W * H);
		const buf2 = new Uint8Array(W * H);
		fillSyntheticEdge(buf1, W, H, 20.0);
		fillSyntheticEdge(buf2, W, H, 20.4);
		const matcher = createBlockMatcher(W, H);
		matcher.process(buf1);
		const r = matcher.process(buf2);
		expect(r).not.toBeNull();
		expect(Math.abs((r?.dy ?? 0) - 0.4)).toBeLessThan(0.25);
	});

	test("matcher returns near-zero confidence on a flat ROI", () => {
		const W = 16;
		const H = 16;
		const flat = new Uint8Array(W * H);
		flat.fill(140);
		const matcher = createBlockMatcher(W, H);
		matcher.process(flat);
		const r = matcher.process(flat);
		expect(r).not.toBeNull();
		expect(r?.confidence ?? 1).toBeLessThan(0.05);
	});
});

function blobTexture(W: number, H: number): Uint8Array {
	const out = new Uint8Array(W * H);
	const centers = [
		{ x: W * 0.2, y: H * 0.25 },
		{ x: W * 0.65, y: H * 0.2 },
		{ x: W * 0.4, y: H * 0.6 },
		{ x: W * 0.8, y: H * 0.7 },
	];
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			let v = 60;
			for (const c of centers) {
				const dx = x - c.x;
				const dy = y - c.y;
				v += 130 * Math.exp(-(dx * dx + dy * dy) / 40);
			}
			out[y * W + x] = Math.min(255, Math.round(v));
		}
	}
	return out;
}

function subpixelShifted(
	src: Uint8Array,
	W: number,
	H: number,
	dy: number,
): Uint8Array {
	const out = new Uint8Array(W * H);
	for (let y = 0; y < H; y++) {
		const sy = y - dy;
		const yi = Math.floor(sy);
		const fy = sy - yi;
		const y0 = Math.max(0, Math.min(H - 1, yi));
		const y1 = Math.max(0, Math.min(H - 1, yi + 1));
		for (let x = 0; x < W; x++) {
			const a = src[y0 * W + x];
			const b = src[y1 * W + x];
			out[y * W + x] = Math.round(a * (1 - fy) + b * fy);
		}
	}
	return out;
}

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
		// Once locked, the tracker doubles its reset streak — need 8+
		// outliers to trigger the snap. Send 10 to be safe.
		for (let i = 0; i < 10; i++) t.update(55, 1);
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
			});
		}
		const out = est.estimate();
		// Either no detection or a value within the legal band — never an
		// absurd sub-band BPM from DC / drift leak.
		if (out.bpm != null) {
			expect(out.bpm).toBeGreaterThanOrEqual(12);
		}
	});

	test("locks onto fast breathing (~100 BPM)", () => {
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
		for (let i = 0; i < fs * 22; i++) {
			// 100 BPM = 1.667 Hz. Small amplitude (~0.5 px) approximates
			// shallow stressed-dog panting.
			const yShift = 0.5 * Math.sin((2 * Math.PI * (100 / 60) * i) / fs);
			translateSubpixel(base, W, H, yShift, tmp);
			lumaToRgba(tmp, rgba);
			est.feed({
				roiRgba: rgba,
				roiWidth: W,
				roiHeight: H,
			});
			if (i > 0 && i % estimateEvery === 0) est.estimate();
		}
		const out = est.estimate();
		expect(out.bpm).not.toBeNull();
		expect(Math.abs((out.bpm ?? 0) - 100)).toBeLessThan(4);
		expect(out.isLocked).toBe(true);
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
			});
			if (i > 0 && i % estimateEvery === 0) est.estimate();
		}
		const locked = est.estimate();
		expect(locked.isLocked).toBe(true);
		const lockedBpm = locked.bpm ?? 0;

		// Inject 1.5s of frames with sudden big shifts (≥5 px) — the
		// motion-outlier rejection should treat them as body motion and
		// drop them, so the locked BPM persists.
		for (let i = 0; i < Math.round(fs * 1.5); i++) {
			const yShift = 6 * (i % 2 === 0 ? 1 : -1);
			translateSubpixel(base, W, H, yShift, tmp);
			lumaToRgba(tmp, rgba);
			est.feed({
				roiRgba: rgba,
				roiWidth: W,
				roiHeight: H,
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
