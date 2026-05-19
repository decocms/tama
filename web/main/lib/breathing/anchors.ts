/**
 * Subject-tracking anchor stabilizer. Picks high-contrast features
 * (Shi–Tomasi corners) in a "halo" ring around the breathing-rate ROI —
 * features that sit on the subject's body (legs, head, fur outside the
 * chest area being measured) but NOT inside the ROI itself (which would
 * pick up the breathing motion we're trying to measure). The median
 * displacement of those features across frames is the on-screen
 * translation of the subject — caused by either camera motion, subject
 * motion, or both. The component uses that offset to slide the ROI on
 * top of the moving subject so the box follows them.
 *
 * Why a halo ring instead of "anything outside the ROI" (the previous
 * world-anchor design): tracking background features keeps the ROI
 * world-locked, which compensates for camera tremor but does NOT follow
 * a moving subject. Halo features stay on the subject, so the ROI moves
 * with them — and since "camera moves" and "subject moves" both
 * manifest as halo features sliding across the frame in the same way,
 * the same offset handles both cases.
 *
 * Constraints to keep in mind:
 *   - The user must place the ROI inside the subject's body silhouette
 *     so the halo overlaps the subject (not the background).
 *   - Smooth-fur subjects with no halo texture won't track. The debug
 *     anchor count in the overlay tells the user this is happening.
 */

const TEMPLATE_RADIUS = 8; // 16×16 patch — more pixels = sharper match
const TEMPLATE_SIZE = 2 * TEMPLATE_RADIUS;
// Wide search so anchors survive moderately fast camera motion. ±20 px
// per frame at 30 fps = 600 px/s in STAB coords — covers most handheld
// pans without losing track.
const SEARCH_RADIUS = 20;
// Tolerant NCC floor — typical indoor scenes have moderate contrast and
// some motion blur during camera movement. 0.3 still rejects noise but
// keeps anchors alive through brief blur.
const MIN_NCC = 0.3;
const NUM_ANCHORS = 8;
const MIN_LIVE_RATIO = 0.5;
const MIN_SEPARATION = 28;
// Permissive Shi–Tomasi: low-texture indoor scenes (white walls, smooth
// furniture) commonly yield λ_min < 30. 6 finds anchors in most scenes
// without picking up sensor noise.
const SHI_TOMASI_MIN_EIG = 6;
const FRAME_MARGIN = 24; // wider margin since search range grew

export type Anchor = {
	initialX: number;
	initialY: number;
	x: number;
	y: number;
	template: Float32Array;
	alive: boolean;
	lastNcc: number;
};

export type CamDrift = {
	dxFrac: number; // drift in fractional units of frame width
	dyFrac: number; // drift in fractional units of frame height
	aliveCount: number;
	anchors: ReadonlyArray<Anchor>;
};

export type AnchorStabilizer = {
	/**
	 * Seed anchors from the current frame.
	 *  - `excludeFracRect`: corners inside this rect are skipped (the
	 *    breathing-rate ROI itself — we don't want chest-motion features
	 *    in the tracker).
	 *  - `includeFracRect`: when provided, corners must lie inside this
	 *    rect. Used to restrict detection to a halo ring around the ROI
	 *    so anchors stay on the subject's body, not the distant
	 *    background.
	 */
	init(
		luma: Uint8Array,
		frameW: number,
		frameH: number,
		excludeFracRect: { x: number; y: number; w: number; h: number },
		includeFracRect?: { x: number; y: number; w: number; h: number },
	): void;
	update(luma: Uint8Array, frameW: number, frameH: number): CamDrift;
	reset(): void;
	isInitialized(): boolean;
};

export function createAnchorStabilizer(): AnchorStabilizer {
	let anchors: Anchor[] = [];
	let frameW = 0;
	let frameH = 0;
	let excludeRect: { x: number; y: number; w: number; h: number } | null = null;
	let includeRect: { x: number; y: number; w: number; h: number } | null = null;

	function detectAndSeed(luma: Uint8Array) {
		if (!excludeRect) return;
		const ex = {
			x: excludeRect.x * frameW,
			y: excludeRect.y * frameH,
			w: excludeRect.w * frameW,
			h: excludeRect.h * frameH,
		};
		const inc = includeRect
			? {
					x: includeRect.x * frameW,
					y: includeRect.y * frameH,
					w: includeRect.w * frameW,
					h: includeRect.h * frameH,
				}
			: null;
		const corners = detectShiTomasiCorners(
			luma,
			frameW,
			frameH,
			NUM_ANCHORS,
			MIN_SEPARATION,
			ex,
			inc,
		);
		anchors = corners.map((c) => ({
			initialX: c.x,
			initialY: c.y,
			x: c.x,
			y: c.y,
			template: extractPatch(luma, frameW, frameH, c.x, c.y),
			alive: true,
			lastNcc: 1,
		}));
	}

	return {
		init(luma, w, h, ex, inc) {
			frameW = w;
			frameH = h;
			excludeRect = ex;
			includeRect = inc ?? null;
			detectAndSeed(luma);
		},
		reset() {
			anchors = [];
			frameW = 0;
			frameH = 0;
			excludeRect = null;
			includeRect = null;
		},
		isInitialized() {
			return anchors.length > 0;
		},
		update(luma, w, h) {
			if (w !== frameW || h !== frameH || anchors.length === 0) {
				return { dxFrac: 0, dyFrac: 0, aliveCount: 0, anchors };
			}

			const dxs: number[] = [];
			const dys: number[] = [];
			for (const a of anchors) {
				if (!a.alive) continue;
				const result = searchPatch(a.template, luma, frameW, frameH, a.x, a.y);
				if (result.ncc < MIN_NCC) {
					a.alive = false;
					a.lastNcc = result.ncc;
					continue;
				}
				a.x = result.x;
				a.y = result.y;
				a.lastNcc = result.ncc;
				dxs.push(a.x - a.initialX);
				dys.push(a.y - a.initialY);
			}

			let dxFrac = 0;
			let dyFrac = 0;
			let aliveCount = 0;
			if (dxs.length > 0) {
				dxs.sort((a, b) => a - b);
				dys.sort((a, b) => a - b);
				const mid = dxs.length >> 1;
				const medX =
					dxs.length % 2 === 1 ? dxs[mid] : 0.5 * (dxs[mid - 1] + dxs[mid]);
				const medY =
					dys.length % 2 === 1 ? dys[mid] : 0.5 * (dys[mid - 1] + dys[mid]);
				dxFrac = medX / frameW;
				dyFrac = medY / frameH;
				aliveCount = dxs.length;
			}

			// If too many anchors died, re-detect a fresh set. Carry the
			// current drift through by re-seeding "initial" positions back
			// to where the camera USED to be — so the drift accounting
			// stays continuous across the re-detect.
			if (aliveCount < Math.ceil(NUM_ANCHORS * MIN_LIVE_RATIO)) {
				const carryDx = dxFrac * frameW;
				const carryDy = dyFrac * frameH;
				detectAndSeed(luma);
				for (const a of anchors) {
					a.initialX = a.x - carryDx;
					a.initialY = a.y - carryDy;
				}
			}

			return { dxFrac, dyFrac, aliveCount, anchors };
		},
	};
}

/* ---------------- Shi–Tomasi corner detection ---------------- */

type Corner = { x: number; y: number; lambda: number };

function detectShiTomasiCorners(
	buf: Uint8Array,
	width: number,
	height: number,
	maxCount: number,
	minDistance: number,
	excludeRect: { x: number; y: number; w: number; h: number } | null,
	includeRect: { x: number; y: number; w: number; h: number } | null,
): Corner[] {
	const candidates: Corner[] = [];
	const margin = Math.max(FRAME_MARGIN, TEMPLATE_RADIUS + SEARCH_RADIUS + 2);

	for (let y = margin; y < height - margin; y++) {
		for (let x = margin; x < width - margin; x++) {
			if (excludeRect && pointInRect(x, y, excludeRect)) continue;
			if (includeRect && !pointInRect(x, y, includeRect)) continue;
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
			if (lambdaMin > SHI_TOMASI_MIN_EIG) {
				candidates.push({ x, y, lambda: lambdaMin });
			}
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

function pointInRect(
	x: number,
	y: number,
	r: { x: number; y: number; w: number; h: number },
): boolean {
	return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/* ---------------- Patch extraction + NCC tracking ---------------- */

function extractPatch(
	buf: Uint8Array,
	W: number,
	H: number,
	cx: number,
	cy: number,
): Float32Array {
	const out = new Float32Array(TEMPLATE_SIZE * TEMPLATE_SIZE);
	for (let dy = 0; dy < TEMPLATE_SIZE; dy++) {
		for (let dx = 0; dx < TEMPLATE_SIZE; dx++) {
			const sx = cx - TEMPLATE_RADIUS + dx;
			const sy = cy - TEMPLATE_RADIUS + dy;
			if (sx < 0 || sx >= W || sy < 0 || sy >= H) {
				out[dy * TEMPLATE_SIZE + dx] = 0;
			} else {
				out[dy * TEMPLATE_SIZE + dx] = buf[sy * W + sx];
			}
		}
	}
	return out;
}

function searchPatch(
	template: Float32Array,
	luma: Uint8Array,
	W: number,
	H: number,
	lastX: number,
	lastY: number,
): { x: number; y: number; ncc: number } {
	let bestX = lastX;
	let bestY = lastY;
	let bestNcc = -Infinity;
	for (let dy = -SEARCH_RADIUS; dy <= SEARCH_RADIUS; dy++) {
		for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx++) {
			const cx = lastX + dx;
			const cy = lastY + dy;
			if (
				cx - TEMPLATE_RADIUS < 0 ||
				cx + TEMPLATE_RADIUS >= W ||
				cy - TEMPLATE_RADIUS < 0 ||
				cy + TEMPLATE_RADIUS >= H
			) {
				continue;
			}
			const ncc = nccPatch(template, luma, W, cx, cy);
			if (ncc > bestNcc) {
				bestNcc = ncc;
				bestX = cx;
				bestY = cy;
			}
		}
	}
	return { x: bestX, y: bestY, ncc: bestNcc };
}

function nccPatch(
	template: Float32Array,
	luma: Uint8Array,
	W: number,
	cx: number,
	cy: number,
): number {
	const N = TEMPLATE_SIZE * TEMPLATE_SIZE;
	let tSum = 0;
	let lSum = 0;
	for (let dy = 0; dy < TEMPLATE_SIZE; dy++) {
		const ly = cy - TEMPLATE_RADIUS + dy;
		for (let dx = 0; dx < TEMPLATE_SIZE; dx++) {
			const lx = cx - TEMPLATE_RADIUS + dx;
			tSum += template[dy * TEMPLATE_SIZE + dx];
			lSum += luma[ly * W + lx];
		}
	}
	const tMean = tSum / N;
	const lMean = lSum / N;

	let num = 0;
	let tVar = 0;
	let lVar = 0;
	for (let dy = 0; dy < TEMPLATE_SIZE; dy++) {
		const ly = cy - TEMPLATE_RADIUS + dy;
		for (let dx = 0; dx < TEMPLATE_SIZE; dx++) {
			const lx = cx - TEMPLATE_RADIUS + dx;
			const dt = template[dy * TEMPLATE_SIZE + dx] - tMean;
			const dl = luma[ly * W + lx] - lMean;
			num += dt * dl;
			tVar += dt * dt;
			lVar += dl * dl;
		}
	}
	const denom = Math.sqrt(tVar * lVar);
	return denom > 0 ? num / denom : 0;
}
