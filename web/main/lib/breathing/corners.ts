/**
 * Shi–Tomasi "good features to track" corner detector. NOT used by the
 * breathing-rate algorithm itself — purely a debug visualization helper
 * so the user can see the algorithm is sampling textured parts of the
 * ROI. Returns up to `maxCount` (x, y) points spread by `minDistance`.
 */

export type Corner = { x: number; y: number; lambda: number };

export function detectCorners(
	buf: Uint8Array,
	width: number,
	height: number,
	maxCount: number,
	options: {
		minDistance?: number;
		margin?: number;
		minEigenvalue?: number;
	} = {},
): Corner[] {
	const minDistance = options.minDistance ?? 6;
	const margin = options.margin ?? 4;
	const minEig = options.minEigenvalue ?? 8;
	const candidates: Corner[] = [];

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

	const selected: Corner[] = [];
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
		selected.push(c);
		if (selected.length >= maxCount) break;
	}
	return selected;
}
