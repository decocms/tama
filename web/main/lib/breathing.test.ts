import { describe, expect, test } from "bun:test";
import { computeFrameDiff, createBreathingEstimator } from "./breathing.ts";

describe("createBreathingEstimator", () => {
	test("recovers 30 BPM from a clean 0.5 Hz sine", () => {
		const fs = 30;
		const est = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 20,
		});
		const N = fs * 20;
		for (let i = 0; i < N; i++) {
			est.feed(Math.sin((2 * Math.PI * 0.5 * i) / fs));
		}
		const out = est.estimate();
		expect(out.bpm).not.toBeNull();
		expect(Math.abs((out.bpm ?? 0) - 30)).toBeLessThan(2);
		expect(out.confidence).toBeGreaterThan(0.8);
	});

	test("recovers 20 BPM from a noisy 0.333 Hz sine", () => {
		const fs = 30;
		const est = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 20,
		});
		const f = 1 / 3;
		const N = fs * 20;
		for (let i = 0; i < N; i++) {
			const sig = Math.sin((2 * Math.PI * f * i) / fs);
			const noise = (Math.random() - 0.5) * 0.4;
			est.feed(sig + noise);
		}
		const out = est.estimate();
		expect(out.bpm).not.toBeNull();
		expect(Math.abs((out.bpm ?? 0) - 20)).toBeLessThan(3);
	});

	test("returns null bpm when buffer is too short", () => {
		const fs = 30;
		const est = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 20,
		});
		for (let i = 0; i < fs * 4; i++) est.feed(Math.sin(i / 10));
		const out = est.estimate();
		expect(out.bpm).toBeNull();
		expect(out.samplesReady).toBe(fs * 4);
	});

	test("low confidence on pure noise", () => {
		const fs = 30;
		const est = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 20,
		});
		for (let i = 0; i < fs * 20; i++) est.feed(Math.random() - 0.5);
		const out = est.estimate();
		expect(out.confidence).toBeLessThan(0.3);
	});
});

describe("computeFrameDiff", () => {
	test("returns 0 for identical frames", () => {
		const a = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
		const b = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
		expect(computeFrameDiff(a, b)).toBe(0);
	});

	test("returns positive value when frames differ", () => {
		const a = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
		const b = new Uint8ClampedArray([100, 120, 130, 255, 140, 150, 160, 255]);
		expect(computeFrameDiff(a, b)).toBeGreaterThan(0);
	});
});
