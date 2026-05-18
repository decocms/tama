import { describe, expect, test } from "bun:test";
import {
	createBreathingEstimator,
	extractSignals,
	type FrameSignals,
} from "./breathing.ts";

function feedSeries(
	est: ReturnType<typeof createBreathingEstimator>,
	values: number[],
	channel: "edge" | "diff",
	globalDiff = 0,
) {
	for (const v of values) {
		const signal: FrameSignals = {
			edge: channel === "edge" ? v : 0,
			diff: channel === "diff" ? v : 0,
			globalDiff,
		};
		est.feed(signal);
	}
}

describe("createBreathingEstimator", () => {
	test("recovers 30 BPM from a clean 0.5 Hz sine (diff channel)", () => {
		const fs = 30;
		const est = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 20,
		});
		const vals: number[] = [];
		for (let i = 0; i < fs * 20; i++) {
			vals.push(Math.sin((2 * Math.PI * 0.5 * i) / fs));
		}
		feedSeries(est, vals, "diff");
		const out = est.estimate();
		expect(out.bpm).not.toBeNull();
		expect(Math.abs((out.bpm ?? 0) - 30)).toBeLessThan(2);
		expect(out.activeSignal).toBe("diff");
	});

	test("recovers 20 BPM from a noisy 0.333 Hz sine (diff channel)", () => {
		const fs = 30;
		const est = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 20,
		});
		const f = 1 / 3;
		const vals: number[] = [];
		for (let i = 0; i < fs * 20; i++) {
			vals.push(
				Math.sin((2 * Math.PI * f * i) / fs) + (Math.random() - 0.5) * 0.4,
			);
		}
		feedSeries(est, vals, "diff");
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
		for (let i = 0; i < fs * 4; i++) {
			est.feed({ edge: 0, diff: Math.sin(i / 10), globalDiff: 0 });
		}
		const out = est.estimate();
		expect(out.bpm).toBeNull();
		expect(out.samplesReady).toBe(fs * 4);
	});

	test("low confidence on pure noise across both channels", () => {
		const fs = 30;
		const est = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 20,
		});
		for (let i = 0; i < fs * 20; i++) {
			est.feed({
				edge: Math.random() - 0.5,
				diff: Math.random() - 0.5,
				globalDiff: 0,
			});
		}
		const out = est.estimate();
		expect(out.confidence).toBeLessThan(0.4);
	});

	test("recovers 30 BPM from a sub-pixel horizontal edge via extractSignals", () => {
		const fs = 30;
		const W = 80;
		const H = 60;
		const est = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 20,
		});
		const curr = new Uint8Array(W * H);
		const prev = new Uint8Array(W * H);
		const scratch = new Uint8Array(W * H);
		// Edge oscillates around row 20 (well inside the top half) so the Haar
		// response stays linear; centering near halfH would give a quadratic
		// response that doubles the detected frequency.
		for (let i = 0; i < fs * 20; i++) {
			const yEdge = 20 + 0.5 * Math.sin((2 * Math.PI * 0.5 * i) / fs);
			const rgba = syntheticEdgeFrame(yEdge, W, H);
			const sigs = extractSignals(
				rgba,
				W,
				H,
				curr,
				i === 0 ? null : prev,
				scratch,
			);
			est.feed({ edge: sigs.edge, diff: sigs.diff, globalDiff: 0 });
			prev.set(curr);
		}
		const out = est.estimate();
		expect(out.bpm).not.toBeNull();
		expect(Math.abs((out.bpm ?? 0) - 30)).toBeLessThan(3);
		expect(out.activeSignal).toBe("edge");
	});

	test("camera-shake gate drops samples and flips shakeRecent", () => {
		const fs = 30;
		const est = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 20,
		});
		// 20 s clean sine with tiny globalDiff
		for (let i = 0; i < fs * 20; i++) {
			const v = Math.sin((2 * Math.PI * 0.5 * i) / fs);
			est.feed({ edge: 0, diff: v, globalDiff: 0.01 });
		}
		const beforeShake = est.estimate();
		expect(beforeShake.shakeRecent).toBe(false);
		const samplesBeforeShake = beforeShake.samplesReady;

		// 1.5 s of pure shake (huge globalDiff)
		for (let i = 0; i < Math.round(fs * 1.5); i++) {
			est.feed({ edge: 0, diff: 5, globalDiff: 100 });
		}
		const duringShake = est.estimate();
		expect(duringShake.shakeRecent).toBe(true);
		// Samples should not have grown by the full 45 (some/most dropped).
		expect(duringShake.samplesReady).toBeLessThan(samplesBeforeShake + 10);
		// BPM stays near 30 because shake didn't pollute the buffer
		expect(duringShake.bpm).not.toBeNull();
		expect(Math.abs((duringShake.bpm ?? 0) - 30)).toBeLessThan(4);
	});

	test("activeSignal picks 'edge' for pure-edge input and 'diff' for pure-diff input", () => {
		const fs = 30;
		const sine = (i: number) => Math.sin((2 * Math.PI * 0.5 * i) / fs);

		const edgeEst = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 20,
		});
		feedSeries(
			edgeEst,
			Array.from({ length: fs * 20 }, (_, i) => sine(i)),
			"edge",
		);
		expect(edgeEst.estimate().activeSignal).toBe("edge");

		const diffEst = createBreathingEstimator({
			sampleRateHz: fs,
			bufferSeconds: 20,
		});
		feedSeries(
			diffEst,
			Array.from({ length: fs * 20 }, (_, i) => sine(i)),
			"diff",
		);
		expect(diffEst.estimate().activeSignal).toBe("diff");
	});
});

describe("extractSignals", () => {
	test("zero diff for identical frames, non-zero for different", () => {
		const W = 8;
		const H = 8;
		const curr = new Uint8Array(W * H);
		const prev = new Uint8Array(W * H);
		const scratch = new Uint8Array(W * H);
		const flat = (v: number) => {
			const rgba = new Uint8ClampedArray(W * H * 4);
			for (let i = 0; i < W * H; i++) {
				rgba[i * 4] = v;
				rgba[i * 4 + 1] = v;
				rgba[i * 4 + 2] = v;
				rgba[i * 4 + 3] = 255;
			}
			return rgba;
		};
		extractSignals(flat(100), W, H, curr, null, scratch);
		prev.set(curr);
		const a = extractSignals(flat(100), W, H, curr, prev, scratch);
		expect(a.diff).toBeLessThan(1);
		prev.set(curr);
		const b = extractSignals(flat(180), W, H, curr, prev, scratch);
		expect(b.diff).toBeGreaterThan(50);
	});

	test("edge signal is monotonic in horizontal edge position", () => {
		const W = 80;
		const H = 60;
		const curr = new Uint8Array(W * H);
		const scratch = new Uint8Array(W * H);
		// Keep positions well inside the top half (halfH=30) so the response
		// stays monotonic — across halfH the Haar feature V-shapes.
		const yPositions = [12, 16, 20, 24, 28];
		const edges = yPositions.map((y) => {
			const rgba = syntheticEdgeFrame(y, W, H);
			return extractSignals(rgba, W, H, curr, null, scratch).edge;
		});
		for (let i = 1; i < edges.length; i++) {
			expect(edges[i]).toBeLessThan(edges[i - 1]);
		}
	});
});

function syntheticEdgeFrame(
	yEdge: number,
	w: number,
	h: number,
): Uint8ClampedArray {
	const rgba = new Uint8ClampedArray(w * h * 4);
	const floor = Math.floor(yEdge);
	const frac = yEdge - floor;
	for (let y = 0; y < h; y++) {
		let v: number;
		if (y < floor) v = 30;
		else if (y > floor) v = 200;
		else v = Math.round(30 * (1 - frac) + 200 * frac);
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			rgba[i] = v;
			rgba[i + 1] = v;
			rgba[i + 2] = v;
			rgba[i + 3] = 255;
		}
	}
	return rgba;
}
