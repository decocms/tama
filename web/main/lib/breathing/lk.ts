export type PyramidLevel = {
	data: Uint8Array;
	width: number;
	height: number;
};

export type Feature = {
	x: number;
	y: number;
	initialX: number;
	initialY: number;
	quality: number;
	alive: boolean;
	age: number;
};

const WINDOW_RADIUS = 2;
const LK_ITERATIONS = 5;
const MIN_DETERMINANT = 1e-7;
const MAX_RESIDUAL = 30;
const MIN_EIGENVALUE = 8;
const CONVERGE_EPS = 0.01;

/**
 * Build a Gaussian-smoothed image pyramid by 2× decimation. `levels=2`
 * gives [full, half]; level i halves both dimensions of level i-1.
 */
export function buildPyramid(
	src: Uint8Array,
	width: number,
	height: number,
	levels: number,
): PyramidLevel[] {
	const pyramid: PyramidLevel[] = [{ data: src, width, height }];
	for (let l = 1; l < levels; l++) {
		const prev = pyramid[l - 1];
		const nw = prev.width >> 1;
		const nh = prev.height >> 1;
		if (nw < 8 || nh < 8) break;
		const next = new Uint8Array(nw * nh);
		// 5-tap separable Gaussian then 2× decimate. Kernel [1,4,6,4,1]/16
		// implemented inline for speed.
		const tmp = new Uint8Array(prev.width * nh);
		for (let y = 0; y < nh; y++) {
			const ySrc = y * 2;
			const y0 = clampIdx(ySrc - 2, prev.height);
			const y1 = clampIdx(ySrc - 1, prev.height);
			const y2 = ySrc;
			const y3 = clampIdx(ySrc + 1, prev.height);
			const y4 = clampIdx(ySrc + 2, prev.height);
			for (let x = 0; x < prev.width; x++) {
				const v =
					prev.data[y0 * prev.width + x] +
					4 * prev.data[y1 * prev.width + x] +
					6 * prev.data[y2 * prev.width + x] +
					4 * prev.data[y3 * prev.width + x] +
					prev.data[y4 * prev.width + x];
				tmp[y * prev.width + x] = (v + 8) >> 4;
			}
		}
		for (let y = 0; y < nh; y++) {
			for (let x = 0; x < nw; x++) {
				const xSrc = x * 2;
				const x0 = clampIdx(xSrc - 2, prev.width);
				const x1 = clampIdx(xSrc - 1, prev.width);
				const x2 = xSrc;
				const x3 = clampIdx(xSrc + 1, prev.width);
				const x4 = clampIdx(xSrc + 2, prev.width);
				const v =
					tmp[y * prev.width + x0] +
					4 * tmp[y * prev.width + x1] +
					6 * tmp[y * prev.width + x2] +
					4 * tmp[y * prev.width + x3] +
					tmp[y * prev.width + x4];
				next[y * nw + x] = (v + 8) >> 4;
			}
		}
		pyramid.push({ data: next, width: nw, height: nh });
	}
	return pyramid;
}

function clampIdx(v: number, hi: number): number {
	if (v < 0) return 0;
	if (v >= hi) return hi - 1;
	return v;
}

function bilinearSample(
	buf: Uint8Array,
	w: number,
	h: number,
	x: number,
	y: number,
): number {
	if (x < 0) x = 0;
	else if (x > w - 1) x = w - 1;
	if (y < 0) y = 0;
	else if (y > h - 1) y = h - 1;
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const fx = x - xi;
	const fy = y - yi;
	const xi1 = xi < w - 1 ? xi + 1 : xi;
	const yi1 = yi < h - 1 ? yi + 1 : yi;
	const a = buf[yi * w + xi];
	const b = buf[yi * w + xi1];
	const c = buf[yi1 * w + xi];
	const d = buf[yi1 * w + xi1];
	return (
		a * (1 - fx) * (1 - fy) +
		b * fx * (1 - fy) +
		c * (1 - fx) * fy +
		d * fx * fy
	);
}

/**
 * Iterative single-scale Lucas–Kanade for one point. Estimates the
 * displacement (dx, dy) that warps `curr` to match `prev` around (fx, fy).
 */
function lkSingleScale(
	prev: PyramidLevel,
	curr: PyramidLevel,
	fx: number,
	fy: number,
	initialDx: number,
	initialDy: number,
): { dx: number; dy: number; residual: number; converged: boolean } {
	let dx = initialDx;
	let dy = initialDy;

	for (let iter = 0; iter < LK_ITERATIONS; iter++) {
		let sxx = 0;
		let syy = 0;
		let sxy = 0;
		let sxt = 0;
		let syt = 0;
		for (let wy = -WINDOW_RADIUS; wy <= WINDOW_RADIUS; wy++) {
			for (let wx = -WINDOW_RADIUS; wx <= WINDOW_RADIUS; wx++) {
				const px = fx + wx;
				const py = fy + wy;
				const cx = px + dx;
				const cy = py + dy;
				const ix =
					(bilinearSample(prev.data, prev.width, prev.height, px + 1, py) -
						bilinearSample(prev.data, prev.width, prev.height, px - 1, py)) *
					0.5;
				const iy =
					(bilinearSample(prev.data, prev.width, prev.height, px, py + 1) -
						bilinearSample(prev.data, prev.width, prev.height, px, py - 1)) *
					0.5;
				const it =
					bilinearSample(curr.data, curr.width, curr.height, cx, cy) -
					bilinearSample(prev.data, prev.width, prev.height, px, py);
				sxx += ix * ix;
				syy += iy * iy;
				sxy += ix * iy;
				sxt += ix * it;
				syt += iy * it;
			}
		}
		const det = sxx * syy - sxy * sxy;
		if (Math.abs(det) < MIN_DETERMINANT) {
			return { dx, dy, residual: Infinity, converged: false };
		}
		const ddx = (sxy * syt - syy * sxt) / det;
		const ddy = (sxy * sxt - sxx * syt) / det;
		dx += ddx;
		dy += ddy;
		if (Math.abs(ddx) < CONVERGE_EPS && Math.abs(ddy) < CONVERGE_EPS) break;
	}

	let residual = 0;
	let n = 0;
	for (let wy = -WINDOW_RADIUS; wy <= WINDOW_RADIUS; wy++) {
		for (let wx = -WINDOW_RADIUS; wx <= WINDOW_RADIUS; wx++) {
			const px = fx + wx;
			const py = fy + wy;
			const diff =
				bilinearSample(curr.data, curr.width, curr.height, px + dx, py + dy) -
				bilinearSample(prev.data, prev.width, prev.height, px, py);
			residual += diff * diff;
			n++;
		}
	}
	residual = Math.sqrt(residual / n);
	return { dx, dy, residual, converged: true };
}

/**
 * Coarse-to-fine pyramidal Lucas–Kanade. Bounds the trackable motion to
 * roughly 2^(levels-1) × WINDOW_RADIUS pixels.
 */
export function lkPyramid(
	prevPyr: PyramidLevel[],
	currPyr: PyramidLevel[],
	fx: number,
	fy: number,
): { dx: number; dy: number; residual: number; converged: boolean } {
	const levels = Math.min(prevPyr.length, currPyr.length);
	let dx = 0;
	let dy = 0;
	for (let l = levels - 1; l >= 0; l--) {
		const scale = 1 << l;
		const result = lkSingleScale(
			prevPyr[l],
			currPyr[l],
			fx / scale,
			fy / scale,
			dx,
			dy,
		);
		if (!result.converged) return result;
		dx = result.dx;
		dy = result.dy;
		if (l > 0) {
			dx *= 2;
			dy *= 2;
		}
	}
	return { dx, dy, residual: 0, converged: true };
}

/**
 * Shi–Tomasi "good features to track" detector. Returns the top features
 * (by min-eigenvalue of the structure tensor) under a minimum-separation
 * constraint.
 */
export function detectShiTomasi(
	buf: Uint8Array,
	width: number,
	height: number,
	maxCount: number,
	options: {
		minDistance?: number;
		margin?: number;
		minEigenvalue?: number;
	} = {},
): Feature[] {
	const minDistance = options.minDistance ?? 6;
	const margin = options.margin ?? 4;
	const minEig = options.minEigenvalue ?? MIN_EIGENVALUE;
	const candidates: { x: number; y: number; lambda: number }[] = [];

	for (let y = margin; y < height - margin; y++) {
		for (let x = margin; x < width - margin; x++) {
			let sxx = 0;
			let syy = 0;
			let sxy = 0;
			for (let wy = -1; wy <= 1; wy++) {
				for (let wx = -1; wx <= 1; wx++) {
					const px = x + wx;
					const py = y + wy;
					const ix =
						(buf[py * width + px + 1] - buf[py * width + px - 1]) * 0.5;
					const iy =
						(buf[(py + 1) * width + px] - buf[(py - 1) * width + px]) * 0.5;
					sxx += ix * ix;
					syy += iy * iy;
					sxy += ix * iy;
				}
			}
			const trace = sxx + syy;
			const det = sxx * syy - sxy * sxy;
			const discr = trace * trace - 4 * det;
			if (discr < 0) continue;
			const lambdaMin = 0.5 * (trace - Math.sqrt(discr));
			if (lambdaMin > minEig) candidates.push({ x, y, lambda: lambdaMin });
		}
	}

	candidates.sort((a, b) => b.lambda - a.lambda);

	const selected: Feature[] = [];
	const minD2 = minDistance * minDistance;
	for (const c of candidates) {
		let ok = true;
		for (const s of selected) {
			const dx = c.x - s.x;
			const dy = c.y - s.y;
			if (dx * dx + dy * dy < minD2) {
				ok = false;
				break;
			}
		}
		if (!ok) continue;
		selected.push({
			x: c.x,
			y: c.y,
			initialX: c.x,
			initialY: c.y,
			quality: c.lambda,
			alive: true,
			age: 0,
		});
		if (selected.length >= maxCount) break;
	}
	return selected;
}

export type FeatureUpdate = {
	medianDy: number;
	meanDy: number;
	aliveCount: number;
	updatedFeatures: Feature[];
};

/**
 * Update every alive feature's position by running pyramidal LK against
 * the new frame. Drops features whose residual is too high or that drift
 * outside the ROI. Returns the median vertical displacement across all
 * surviving features (the breathing signal).
 */
export function updateFeatures(
	features: Feature[],
	prevPyr: PyramidLevel[],
	currPyr: PyramidLevel[],
): FeatureUpdate {
	const dyValues: number[] = [];
	const W = prevPyr[0].width;
	const H = prevPyr[0].height;
	let sumDy = 0;
	let aliveCount = 0;
	for (const f of features) {
		if (!f.alive) continue;
		const result = lkPyramid(prevPyr, currPyr, f.x, f.y);
		if (
			!result.converged ||
			result.residual > MAX_RESIDUAL ||
			Number.isNaN(result.dx) ||
			Number.isNaN(result.dy)
		) {
			f.alive = false;
			continue;
		}
		const nx = f.x + result.dx;
		const ny = f.y + result.dy;
		if (nx < 4 || nx > W - 5 || ny < 4 || ny > H - 5) {
			f.alive = false;
			continue;
		}
		f.x = nx;
		f.y = ny;
		f.age++;
		dyValues.push(result.dy);
		sumDy += result.dy;
		aliveCount++;
	}
	if (dyValues.length === 0) {
		return { medianDy: 0, meanDy: 0, aliveCount: 0, updatedFeatures: features };
	}
	dyValues.sort((a, b) => a - b);
	const medianDy = dyValues[dyValues.length >> 1];
	const meanDy = sumDy / aliveCount;
	return { medianDy, meanDy, aliveCount, updatedFeatures: features };
}
