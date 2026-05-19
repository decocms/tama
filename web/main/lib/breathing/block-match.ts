/**
 * Per-frame vertical-shift estimation via 2D normalized cross-correlation
 * against a slowly drifting 2D template. Drop-in replacement for the v6
 * `row-projection` module — same surface (`process`, `reset`, `getTemplate`)
 * but the template is a full 2D Uint-luma snapshot of the sub-region
 * instead of a 1D mean-per-row profile.
 *
 * Why this matters:
 *  - Row-projection collapses each row's pixels into a single mean and
 *    cross-correlates 1D profiles. When the ROI sits on a high-contrast
 *    horizontal edge (back vs floor), the profile has a sharp step and
 *    NCC locks beautifully. When the ROI sits inside soft texture (fur,
 *    chest with no obvious silhouette), the per-row mean averages all
 *    that 2D detail away and the profile goes nearly flat — NCC reads
 *    noise.
 *  - 2D NCC keeps every pixel as an independent feature. Fur micro-
 *    texture, fold lines, color blotches — anything that varies across
 *    rows or columns — contributes to the match. The peak is sharper
 *    for the same physical motion.
 *
 * Pipeline per call:
 *  1. If uninitialized: copy the input luma into the template buffer and
 *     return null (no shift to report yet).
 *  2. Compute 2D NCC at integer vertical shifts dy ∈ [-maxShift..+maxShift].
 *     Per-shift means and stddevs are recomputed over the *overlap
 *     rectangle* (same per-shift normalization as the 1D version, so the
 *     count ratio bias is avoided when the profile isn't stationary).
 *  3. Find the integer-shift peak; refine with parabolic interpolation
 *     across (peak-1, peak, peak+1) for sub-pixel accuracy.
 *  4. Slowly EMA the template toward the current frame.
 */

const DEFAULT_MAX_SHIFT = 8;
const DEFAULT_TEMPLATE_ALPHA = 0.005;

export type BlockMatcher = {
	process(luma: Uint8Array): { dy: number; confidence: number } | null;
	reset(): void;
	getTemplate(): Float32Array;
};

export function createBlockMatcher(
	width: number,
	height: number,
	options: { templateAlpha?: number; maxShift?: number } = {},
): BlockMatcher {
	const W = width;
	const H = height;
	const N = W * H;
	const alpha = options.templateAlpha ?? DEFAULT_TEMPLATE_ALPHA;
	const maxShift = options.maxShift ?? DEFAULT_MAX_SHIFT;
	const template = new Float32Array(N);
	let initialized = false;

	return {
		process(luma: Uint8Array) {
			if (luma.length !== N) return null;

			if (!initialized) {
				for (let i = 0; i < N; i++) template[i] = luma[i];
				initialized = true;
				return null;
			}

			const len = 2 * maxShift + 1;
			const ncc = new Float32Array(len);
			let peakIdx = 0;
			let peakValue = -Infinity;
			for (let dy = -maxShift; dy <= maxShift; dy++) {
				const value = nccAtShift2D(template, luma, W, H, dy);
				const idx = dy + maxShift;
				ncc[idx] = value;
				if (value > peakValue) {
					peakValue = value;
					peakIdx = idx;
				}
			}

			const integerShift = peakIdx - maxShift;
			const subShift = parabolicSubpixel(ncc, peakIdx);
			const result = {
				dy: integerShift + subShift,
				confidence: Math.max(0, peakValue),
			};

			// Slow EMA toward current frame. Long enough time constant that
			// breathing oscillations (sub-second cycles) don't get absorbed,
			// short enough that real positional drift catches up in seconds.
			for (let i = 0; i < N; i++) {
				template[i] = (1 - alpha) * template[i] + alpha * luma[i];
			}

			return result;
		},
		reset() {
			initialized = false;
		},
		getTemplate() {
			return template;
		},
	};
}

/**
 * 2D NCC between `template` and `curr` at vertical shift `dy`. The
 * comparison is over the rectangular overlap; both means and stddevs
 * are recomputed for each shift over its specific overlap region to
 * avoid the count-ratio bias that a global mean/stddev would introduce
 * when the image isn't statistically stationary.
 */
export function nccAtShift2D(
	template: Float32Array,
	curr: Uint8Array,
	W: number,
	H: number,
	dy: number,
): number {
	const yStart = Math.max(0, -dy);
	const yEnd = Math.min(H, H - dy);
	const rowCount = yEnd - yStart;
	if (rowCount < 4) return 0;

	let tSum = 0;
	let cSum = 0;
	for (let y = yStart; y < yEnd; y++) {
		const trow = y * W;
		const crow = (y + dy) * W;
		for (let x = 0; x < W; x++) {
			tSum += template[trow + x];
			cSum += curr[crow + x];
		}
	}
	const count = rowCount * W;
	const tMean = tSum / count;
	const cMean = cSum / count;

	let num = 0;
	let tVar = 0;
	let cVar = 0;
	for (let y = yStart; y < yEnd; y++) {
		const trow = y * W;
		const crow = (y + dy) * W;
		for (let x = 0; x < W; x++) {
			const dt = template[trow + x] - tMean;
			const dc = curr[crow + x] - cMean;
			num += dt * dc;
			tVar += dt * dt;
			cVar += dc * dc;
		}
	}
	const denom = Math.sqrt(tVar * cVar);
	return denom > 0 ? num / denom : 0;
}

/**
 * Parabolic fit through (peakIdx-1, peakIdx, peakIdx+1) for sub-sample
 * peak location. Returns the offset from `peakIdx` in [-0.5, 0.5]. Falls
 * back to 0 at array boundaries or when the curvature isn't a maximum
 * (concave-up means the fit isn't a true peak — usually a saddle point
 * from the search hitting the edge of the lookup range).
 */
function parabolicSubpixel(ncc: Float32Array, peakIdx: number): number {
	if (peakIdx <= 0 || peakIdx >= ncc.length - 1) return 0;
	const ym1 = ncc[peakIdx - 1];
	const y0 = ncc[peakIdx];
	const yp1 = ncc[peakIdx + 1];
	const denom = ym1 - 2 * y0 + yp1;
	if (denom >= -1e-12) return 0;
	let delta = (0.5 * (ym1 - yp1)) / denom;
	if (delta < -0.5) delta = -0.5;
	else if (delta > 0.5) delta = 0.5;
	return delta;
}
