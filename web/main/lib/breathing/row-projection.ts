/**
 * Vertical-shift estimation via 1D row-projection normalized cross-
 * correlation. The ROI is collapsed each frame to a 1D vertical luminance
 * profile (mean per row), and consecutive profiles are compared via NCC
 * to recover the sub-pixel vertical translation between them.
 *
 * Integrating across the full ROI width gives the best per-frame SNR
 * achievable for vertical motion: every pixel contributes to the
 * measurement. The recovered per-frame dy is then accumulated by the
 * caller to produce the cumulative breathing position signal.
 */

export const MAX_SHIFT = 3;

export type RowProjector = {
	process(luma: Uint8Array): { dy: number; confidence: number } | null;
	reset(): void;
	getCurrentProfile(): Float32Array;
};

export function createRowProjector(
	width: number,
	height: number,
): RowProjector {
	const W = width;
	const H = height;
	const currProfile = new Float32Array(H);
	let prevProfile: Float32Array | null = null;

	return {
		process(luma: Uint8Array) {
			if (luma.length !== W * H) return null;

			for (let y = 0; y < H; y++) {
				let sum = 0;
				const row = y * W;
				for (let x = 0; x < W; x++) sum += luma[row + x];
				currProfile[y] = sum / W;
			}

			if (!prevProfile) {
				prevProfile = new Float32Array(currProfile);
				return null;
			}

			const result = measureVerticalShift(prevProfile, currProfile, MAX_SHIFT);
			prevProfile.set(currProfile);
			return result;
		},
		reset() {
			prevProfile = null;
		},
		getCurrentProfile() {
			return currProfile;
		},
	};
}

/**
 * Returns the sub-pixel vertical shift that best aligns `curr` to `prev`,
 * along with the normalized cross-correlation at the peak (in [-1, 1]).
 * Positive dy means `curr` is shifted DOWN relative to `prev`.
 *
 * NCC is computed properly over each shift's overlap region — means and
 * standard deviations are recomputed per-shift on the overlap pixels.
 * Using a global mean/stddev biases the result by the count ratio when
 * the profile isn't stationary across the array.
 */
export function measureVerticalShift(
	prev: Float32Array,
	curr: Float32Array,
	maxShift: number,
): { dy: number; confidence: number } {
	const N = prev.length;
	if (N === 0 || curr.length !== N) return { dy: 0, confidence: 0 };

	const len = 2 * maxShift + 1;
	const ncc = new Float32Array(len);
	let peakIdx = 0;
	let peakValue = -Infinity;
	for (let k = -maxShift; k <= maxShift; k++) {
		const value = nccAtShift(prev, curr, k);
		const idx = k + maxShift;
		ncc[idx] = value;
		if (value > peakValue) {
			peakValue = value;
			peakIdx = idx;
		}
	}

	const integerShift = peakIdx - maxShift;
	const subShift = parabolicSubpixel(ncc, peakIdx);
	const dy = integerShift + subShift;
	return { dy, confidence: Math.max(0, peakValue) };
}

function nccAtShift(prev: Float32Array, curr: Float32Array, k: number): number {
	const N = prev.length;
	const yStart = Math.max(0, -k);
	const yEnd = Math.min(N, N - k);
	const count = yEnd - yStart;
	if (count < 2) return 0;

	let pSum = 0;
	let cSum = 0;
	for (let y = yStart; y < yEnd; y++) {
		pSum += prev[y];
		cSum += curr[y + k];
	}
	const pMean = pSum / count;
	const cMean = cSum / count;

	let num = 0;
	let pVar = 0;
	let cVar = 0;
	for (let y = yStart; y < yEnd; y++) {
		const dp = prev[y] - pMean;
		const dc = curr[y + k] - cMean;
		num += dp * dc;
		pVar += dp * dp;
		cVar += dc * dc;
	}
	const denom = Math.sqrt(pVar * cVar);
	return denom > 0 ? num / denom : 0;
}

/**
 * Parabolic fit through (peakIdx-1, peakIdx, peakIdx+1) for sub-sample peak
 * location. Returns the offset from `peakIdx` in [-0.5, 0.5]. Falls back
 * to 0 at boundaries or when the curvature isn't a maximum.
 */
function parabolicSubpixel(ncc: Float32Array, peakIdx: number): number {
	if (peakIdx <= 0 || peakIdx >= ncc.length - 1) return 0;
	const ym1 = ncc[peakIdx - 1];
	const y0 = ncc[peakIdx];
	const yp1 = ncc[peakIdx + 1];
	const denom = ym1 - 2 * y0 + yp1;
	// Concave-up (denom > 0) means we found a minimum, not a peak. Skip.
	if (denom >= -1e-12) return 0;
	let delta = (0.5 * (ym1 - yp1)) / denom;
	if (delta < -0.5) delta = -0.5;
	else if (delta > 0.5) delta = 0.5;
	return delta;
}
