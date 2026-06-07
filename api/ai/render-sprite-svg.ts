// Procedural SVG sprite renderer. Trades the magic of img2img for
// determinism, instant generation, free, and crisp at any size.
//
// Same input as the raster pipeline: a CharacterSheet produced by Claude
// vision on the source photo. The renderer builds a layered, portrait-style
// pet face — fur halo, breed-scaled ears, particolor coat (cap + blaze +
// light muzzle driven by the character sheet's colors/markings), gradient
// shading, and big glossy eyes — that reads as the same individual across
// all 6 expressions (eyes/mouth/ears/extras change per state; identity holds).
//
// Everything composes inside a 64×64 viewBox so the sprites swap cleanly
// under the companion's breathing animation.

import type { CharacterSheet } from "./extract-character.ts";

export type SpriteState =
	| "idle"
	| "happy"
	| "hungry"
	| "pill-time"
	| "sleeping"
	| "sad";

export const STATES: SpriteState[] = [
	"idle",
	"happy",
	"hungry",
	"pill-time",
	"sleeping",
	"sad",
];

// Plain English → CSS-color map. Claude is asked to use phrases like
// "cream tan" or "black and white" in primaryColor. We pick the most
// salient color word; unknowns fall back to a warm tan.
const COLOR_WORDS: Record<string, string> = {
	cream: "#efe2cf",
	tan: "#d6ab7e",
	fawn: "#dcc09a",
	beige: "#e0cbab",
	gold: "#dba75a",
	golden: "#dba75a",
	apricot: "#e8b888",
	ginger: "#d68646",
	orange: "#e08b4a",
	rust: "#b5673a",
	red: "#b85a3a",
	sable: "#7a5536",
	brown: "#9a6a44",
	chocolate: "#5f3d24",
	liver: "#6b4226",
	black: "#2c2620",
	white: "#f6efe4",
	gray: "#a8a098",
	grey: "#a8a098",
	silver: "#cfc8c0",
	blue: "#8f9aa6",
	yellow: "#e3b85a",
	caramel: "#b87844",
	chestnut: "#8b5a3c",
	merle: "#9aa0a6",
};

function pickColor(desc: string | null | undefined, fallback: string): string {
	if (!desc) return fallback;
	const lower = desc.toLowerCase();
	// Prefer the longest matching word so "chocolate" beats "late"-type partials.
	let best: { word: string; hex: string } | null = null;
	for (const [word, hex] of Object.entries(COLOR_WORDS)) {
		if (lower.includes(word) && (!best || word.length > best.word.length)) {
			best = { word, hex };
		}
	}
	return best?.hex ?? fallback;
}

function clamp8(n: number): number {
	return Math.max(0, Math.min(255, Math.round(n)));
}
function rgb(hex: string): [number, number, number] {
	const m = hex.match(/^#([0-9a-f]{6})$/i);
	if (!m) return [212, 165, 126];
	const n = Number.parseInt(m[1], 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function hex([r, g, b]: [number, number, number]): string {
	return `#${((clamp8(r) << 16) | (clamp8(g) << 8) | clamp8(b)).toString(16).padStart(6, "0")}`;
}
function shade(c: string, amt = 0.84): string {
	const [r, g, b] = rgb(c);
	return hex([r * amt, g * amt, b * amt]);
}
function lighten(c: string, amt = 0.18): string {
	const [r, g, b] = rgb(c);
	return hex([r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt]);
}
// Perceived luminance 0..255 — used to decide light vs dark coat handling.
function luma(c: string): number {
	const [r, g, b] = rgb(c);
	return 0.299 * r + 0.587 * g + 0.114 * b;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Parts {
	body: string;
	bodyLight: string;
	bodyShade: string;
	patch: string | null; // secondary coat color for cap + ears (particolor)
	patchInner: string;
	tan: string | null; // tan/tricolor points (eyebrow dots + cheeks below mask)
	earInner: string;
	muzzle: string; // lighter muzzle/blaze
	nose: string;
	feat: string; // eyes/mouth ink
	blush: string;
	tongue: string;
}

interface Traits {
	longCoat: boolean;
	bigEars: boolean;
	hasCap: boolean; // draw a colored cap + dark ears (particolor)
	cat: boolean;
}

function analyze(character: CharacterSheet): { p: Parts; t: Traits } {
	const body = pickColor(character.primaryColor, "#e6c9a3");
	const bodyDark = luma(body) < 90;
	const secondary = character.secondaryColor
		? pickColor(character.secondaryColor, "")
		: "";
	const markingText = (character.markings ?? []).join(" ").toLowerCase();
	const featText = (character.distinctiveFeatures ?? []).join(" ").toLowerCase();
	const breed = (character.breed ?? "").toLowerCase();
	const blob = `${breed} ${markingText} ${featText}`;

	// Particolor: a clear second color, or marking words implying patches.
	const markingDark = /black|sable|patch|mask|bicolor|tricolor|tuxedo|cap|tan/.test(
		markingText,
	);
	const patch =
		secondary && secondary !== body
			? secondary
			: markingDark && !bodyDark
				? shade(body, 0.38)
				: null;

	// Tan / tricolor points — the yellowish eyebrow dots + cheek fur below a
	// dark mask that black-and-tan / tricolor pets have. Triggered by a "tan"
	// secondary color or tan/tricolor/point markings.
	const tanText = `${character.secondaryColor ?? ""} ${markingText} ${featText}`;
	const tan = /tan|tricolor|tri-color|\bpoints?\b|eyebrow/.test(tanText)
		? "#cf9a52"
		: null;

	const nose = bodyDark ? "#1c1814" : "#3a2c24";
	const p: Parts = {
		body,
		bodyLight: lighten(body, bodyDark ? 0.22 : 0.14),
		bodyShade: shade(body, 0.86),
		patch,
		patchInner: patch ? lighten(patch, 0.16) : "#caa",
		tan,
		earInner: "#f1b7a6",
		muzzle: bodyDark ? lighten(body, 0.5) : lighten(body, 0.28),
		nose,
		feat: "#241c16",
		blush: "#f0939d",
		tongue: "#ec6b80",
	};
	const t: Traits = {
		longCoat: /long|fluff|fringe|feather|maltese|collie|pomeranian|spitz|chihuahua|shih|york|setter|spaniel/.test(
			blob,
		),
		bigEars:
			character.earShape === "pointy" ||
			character.earShape === "tufted" ||
			/big ear|large ear|oversized|chihuahua|corgi|french|terrier|shepherd/.test(
				blob,
			),
		hasCap: !!patch,
		cat: /cat|kitten|feline/.test(`${character.species} ${breed}`),
	};
	return { p, t };
}

// Head geometry: an apple-head dome + a short muzzle bump, parameterised so
// features sit consistently across states and head shapes.
interface Geom {
	cx: number;
	domeCy: number;
	domeRx: number;
	domeRy: number;
	muzzleCy: number;
	muzzleRx: number;
	muzzleRy: number;
	eyeY: number;
	eyeDx: number;
	noseY: number;
	mouthY: number;
}

function geomFor(character: CharacterSheet): Geom {
	const shape = (character.headShape ?? "").toLowerCase();
	const long = shape.includes("long") || shape.includes("narrow");
	const boxy = shape.includes("boxy") || shape.includes("square") || shape.includes("broad");
	// Rounder face: a near-circular dome that mostly contains the muzzle, so the
	// snout reads as part of a round head (not a long face with a Santa beard).
	const domeRx = long ? 16.5 : boxy ? 19.5 : 18;
	const domeRy = long ? 17.5 : boxy ? 16 : 16.5;
	return {
		cx: 32,
		domeCy: 28,
		domeRx,
		domeRy,
		muzzleCy: 40,
		muzzleRx: boxy ? 11 : 9.5,
		muzzleRy: 7.5,
		eyeY: 30,
		eyeDx: 9,
		noseY: 38.5,
		mouthY: 43,
	};
}

// ---- fur ruff: a soft wavy halo behind the head for long coats. Biased to
// the cheeks + chest (where a long coat actually pools) and kept almost flat
// across the top so it tucks behind the ears instead of spiking past them. ----
function furHalo(g: Geom, color: string): string {
	const n = 44;
	const pts: string[] = [];
	for (let i = 0; i < n; i++) {
		const a = (Math.PI * 2 * i) / n - Math.PI / 2;
		const s = Math.sin(a);
		const wave = i % 2 === 0 ? 1 : 0.5; // gentle, not jagged
		// A tight fur outline hugging the head — fullest at the cheeks, minimal
		// at the chin (so it doesn't become a Santa beard) and at the crown
		// (tucks behind the ears).
		const region =
			s < -0.2 ? 0.35 : s > 0.55 ? 0.4 : s > 0.15 ? 0.75 : 1;
		const out = 0.8 + 2.1 * region * wave;
		const rx = g.domeRx + 1 + out;
		const ry = g.domeRy + 1.5 + out;
		const x = g.cx + Math.cos(a) * rx;
		const y = g.domeCy + 2.5 + s * ry;
		pts.push(`${r2(x)},${r2(y)}`);
	}
	return `<polygon points="${pts.join(" ")}" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`;
}

// ---- ears ----
function ears(
	character: CharacterSheet,
	p: Parts,
	t: Traits,
	g: Geom,
	droop: number,
): string {
	const dy = droop;
	const earFill = p.patch ?? p.bodyShade;
	const big = t.bigEars;
	if (character.earShape === "floppy") {
		// Long hanging ears beside the head.
		const lx = g.cx - g.domeRx + 2;
		const rx = g.cx + g.domeRx - 2;
		const top = g.domeCy - g.domeRy + 4;
		return `
			<path d="M ${lx} ${top + dy} C ${lx - 11} ${top + 6 + dy}, ${lx - 12} ${top + 26 + dy}, ${lx - 2} ${top + 32 + dy} C ${lx + 4} ${top + 20 + dy}, ${lx + 4} ${top + 8 + dy}, ${lx} ${top + dy} Z" fill="${earFill}"/>
			<path d="M ${rx} ${top + dy} C ${rx + 11} ${top + 6 + dy}, ${rx + 12} ${top + 26 + dy}, ${rx + 2} ${top + 32 + dy} C ${rx - 4} ${top + 20 + dy}, ${rx - 4} ${top + 8 + dy}, ${rx} ${top + dy} Z" fill="${earFill}"/>
			<path d="M ${lx - 2} ${top + 8 + dy} C ${lx - 7} ${top + 14 + dy}, ${lx - 7} ${top + 24 + dy}, ${lx - 2} ${top + 28 + dy}" fill="${p.earInner}" opacity="0.5"/>
			<path d="M ${rx + 2} ${top + 8 + dy} C ${rx + 7} ${top + 14 + dy}, ${rx + 7} ${top + 24 + dy}, ${rx + 2} ${top + 28 + dy}" fill="${p.earInner}" opacity="0.5"/>
		`;
	}
	if (character.earShape === "round") {
		const ex = g.domeRx - 3;
		const ey = g.domeCy - g.domeRy + 3 + dy;
		const rr = big ? 7 : 5.5;
		return `
			<circle cx="${g.cx - ex}" cy="${ey}" r="${rr}" fill="${earFill}"/>
			<circle cx="${g.cx + ex}" cy="${ey}" r="${rr}" fill="${earFill}"/>
			<circle cx="${g.cx - ex}" cy="${ey + 0.5}" r="${rr * 0.5}" fill="${p.earInner}" opacity="0.8"/>
			<circle cx="${g.cx + ex}" cy="${ey + 0.5}" r="${rr * 0.5}" fill="${p.earInner}" opacity="0.8"/>
		`;
	}
	// pointy / tufted / default — big upright leaf ears (chihuahua-style).
	// One canonical ear drawn around a local (0,0) base anchor pointing up and
	// leaning slightly outward; the right ear is the SAME path mirrored with
	// scale(-1,1) so the two are guaranteed-symmetric (no twisting).
	const w = big ? 10.5 : 8; // half-width at base
	const h = big ? 23 : 18; // height above the dome
	const baseY = g.domeCy - g.domeRy * 0.52 + dy;
	const lbx = g.cx - g.domeRx * 0.64;
	const rbx = g.cx + g.domeRx * 0.64;
	const outer = `M ${r2(-w * 0.7)} 2 Q ${r2(-w)} ${r2(-h * 0.5)} ${r2(-w * 0.5)} ${r2(-h)} Q ${r2(w * 0.15)} ${r2(-h * 0.62)} ${r2(w * 0.62)} 2 Z`;
	const inner = `M ${r2(-w * 0.34)} 0 Q ${r2(-w * 0.5)} ${r2(-h * 0.48)} ${r2(-w * 0.28)} ${r2(-h * 0.74)} Q ${r2(w * 0.06)} ${r2(-h * 0.5)} ${r2(w * 0.3)} 0 Z`;
	const back = t.longCoat
		? `<path d="M ${r2(-w * 0.85)} 2 Q ${r2(-w * 1.15)} ${r2(-h * 0.5)} ${r2(-w * 0.55)} ${r2(-h * 1.05)} Q ${r2(w * 0.2)} ${r2(-h * 0.62)} ${r2(w * 0.78)} 2 Z" fill="${p.bodyLight}" opacity="0.6"/>`
		: "";
	const earGroup = `${back}<path d="${outer}" fill="${earFill}"/><path d="${inner}" fill="${p.earInner}" opacity="0.85"/>`;
	return `
		<g transform="translate(${r2(lbx)} ${r2(baseY)})">${earGroup}</g>
		<g transform="translate(${r2(rbx)} ${r2(baseY)}) scale(-1 1)">${earGroup}</g>
	`;
}

// ---- head silhouette (dome + muzzle) with soft radial shading ----
function head(p: Parts, g: Geom, gradId: string): string {
	return `
		<ellipse cx="${g.cx}" cy="${g.muzzleCy}" rx="${g.muzzleRx}" ry="${g.muzzleRy}" fill="${p.body}"/>
		<ellipse cx="${g.cx}" cy="${g.domeCy}" rx="${g.domeRx}" ry="${g.domeRy}" fill="url(#${gradId})"/>
	`;
}

// ---- particolor: dark cap over the dome + a light blaze + light muzzle ----
function coat(p: PartsX, g: Geom): string {
	const out: string[] = [];
	const cx = g.cx;
	const top = g.domeCy - g.domeRy;
	if (p.hasCapEnabled) {
		// Solid dark cap over the top of the head, lower edge a smooth shallow
		// arc that frames the eyes (no central widow's-peak spike).
		out.push(
			`<path d="M ${cx - g.domeRx * 0.97} ${g.domeCy + 2} Q ${cx - g.domeRx} ${top + 1} ${cx} ${top - 1} Q ${cx + g.domeRx} ${top + 1} ${cx + g.domeRx * 0.97} ${g.domeCy + 2} Q ${cx} ${g.domeCy + 5} ${cx - g.domeRx * 0.97} ${g.domeCy + 2} Z" fill="${p.patch}"/>`,
		);
		// White blaze — a wedge that OPENS UPWARD: a point near the muzzle that
		// widens to a rounded top on the forehead (real blaze direction; the old
		// one narrowed upward).
		const bw = 5;
		const byTop = g.domeCy - g.domeRy * 0.45;
		const byBot = g.domeCy + 8.5;
		out.push(
			`<path d="M ${cx} ${byBot} C ${cx - 2} ${g.domeCy + 3} ${cx - bw} ${r2(byTop + 5)} ${cx - bw} ${r2(byTop)} Q ${cx} ${r2(byTop - 2.6)} ${cx + bw} ${r2(byTop)} C ${cx + bw} ${r2(byTop + 5)} ${cx + 2} ${g.domeCy + 3} ${cx} ${byBot} Z" fill="${p.muzzle}"/>`,
		);
	}
	// Tan cheek fur just below the mask (black-and-tan / tricolor). Drawn before
	// the muzzle so the white snout covers the centre and tan stays on the
	// cheeks. Soft so it melts into the coat.
	if (p.tan) {
		const cy = g.muzzleCy - 5;
		out.push(
			`<ellipse cx="${cx - g.muzzleRx}" cy="${cy}" rx="5.6" ry="4.6" fill="${p.tan}" opacity="0.6"/>`,
			`<ellipse cx="${cx + g.muzzleRx}" cy="${cy}" rx="5.6" ry="4.6" fill="${p.tan}" opacity="0.6"/>`,
		);
	}
	// Light muzzle/chin area (always — gives the snout definition), with a thin
	// shaded outline + a soft under-shadow so the snout is delimited from the
	// face and the fur ruff behind it.
	out.push(
		`<ellipse cx="${cx}" cy="${g.muzzleCy + 0.5}" rx="${g.muzzleRx}" ry="${g.muzzleRy}" fill="${p.muzzle}"/>`,
		`<ellipse cx="${cx}" cy="${g.muzzleCy + 0.5}" rx="${g.muzzleRx}" ry="${g.muzzleRy}" fill="none" stroke="${p.bodyShade}" stroke-width="0.6" opacity="0.5"/>`,
		`<path d="M ${r2(cx - g.muzzleRx * 0.82)} ${r2(g.muzzleCy + 2)} Q ${cx} ${r2(g.muzzleCy + g.muzzleRy + 2.5)} ${r2(cx + g.muzzleRx * 0.82)} ${r2(g.muzzleCy + 2)}" fill="none" stroke="${p.bodyShade}" stroke-width="1" opacity="0.4" stroke-linecap="round"/>`,
	);
	// Tan eyebrow dots above the eyes (on the dark mask) — the "yellowish
	// eyebrows". Tilted slightly outward like real brow points.
	if (p.tan) {
		const by = g.eyeY - 5.4;
		const bdx = g.eyeDx * 0.82;
		out.push(
			`<ellipse cx="${cx - bdx}" cy="${by}" rx="2.5" ry="1.5" fill="${p.tan}" transform="rotate(-16 ${r2(cx - bdx)} ${r2(by)})"/>`,
			`<ellipse cx="${cx + bdx}" cy="${by}" rx="2.5" ry="1.5" fill="${p.tan}" transform="rotate(16 ${r2(cx + bdx)} ${r2(by)})"/>`,
		);
	}
	return out.join("\n");
}

// Hack: smuggle hasCap into Parts for coat() without widening every signature.
interface PartsX extends Parts {
	hasCapEnabled?: boolean;
}

// ---- eyes (per state), big and glossy ----
function eyes(state: SpriteState, p: Parts, g: Geom): string {
	const lx = g.cx - g.eyeDx;
	const rx = g.cx + g.eyeDx;
	const y = g.eyeY;
	const ink = p.feat;
	// The eyes sit on the dark cap (particolor). Filled pupils read fine on
	// their white sclera, but stroke-only expressions (happy/sad/sleeping
	// squints, pill-time brows) would disappear into the dark fur — so draw
	// those strokes in a light ink whenever the cap is dark.
	// A solid dark eye inside a warm-amber ring with a thin dark outline. The
	// amber differs from BOTH white/cream fur and the dark cap (so the eye never
	// blends into the coat, the way a cream rim did against the white blaze),
	// and the hairline outline keeps the edge crisp on light fur. Reads like a
	// natural tan eye-marking.
	const ring = "#e7cf9c";
	// Closed/curved eye lines: a dark stroke with an amber core on top, so the
	// line reads on BOTH the dark mask (amber pops) and the light blaze (dark
	// border delineates) — a single light line blended into the blaze; a single
	// dark one vanished on the mask.
	const lash = (d: string, w = 2.2) =>
		`<path d="${d}" stroke="#2a2017" stroke-width="${w + 1.4}" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${ring}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
	const open = (ex: number) => `
		<ellipse cx="${ex}" cy="${y}" rx="4.5" ry="5.1" fill="${ring}" stroke="#3a2c1e" stroke-width="0.6"/>
		<ellipse cx="${ex}" cy="${y}" rx="3.3" ry="4" fill="${ink}"/>
		<circle cx="${ex + 1.1}" cy="${y - 1.5}" r="1.2" fill="#fff"/>
		<circle cx="${ex - 1}" cy="${y + 1.4}" r="0.55" fill="#fff" opacity="0.6"/>
	`;
	switch (state) {
		case "happy":
			return (
				lash(`M ${lx - 4} ${y + 1.5} Q ${lx} ${y - 4.5} ${lx + 4} ${y + 1.5}`, 2.3) +
				lash(`M ${rx - 4} ${y + 1.5} Q ${rx} ${y - 4.5} ${rx + 4} ${y + 1.5}`, 2.3)
			);
		case "hungry":
			return `${open(lx)}${open(rx)}
				<circle cx="${lx + 1.8}" cy="${y - 2}" r="0.8" fill="#fff"/>
				<circle cx="${rx + 1.8}" cy="${y - 2}" r="0.8" fill="#fff"/>`;
		case "pill-time":
			return `
				${lash(`M ${lx - 4} ${y - 4} Q ${lx} ${y - 6.2} ${lx + 4} ${y - 4.2}`, 1.5)}
				${lash(`M ${rx - 4} ${y - 4.2} Q ${rx} ${y - 6.2} ${rx + 4} ${y - 4}`, 1.5)}
				<ellipse cx="${lx}" cy="${y + 0.6}" rx="3.8" ry="4.2" fill="${ring}" stroke="#3a2c1e" stroke-width="0.6"/>
				<ellipse cx="${rx}" cy="${y + 0.6}" rx="3.8" ry="4.2" fill="${ring}" stroke="#3a2c1e" stroke-width="0.6"/>
				<ellipse cx="${lx}" cy="${y + 0.8}" rx="2.6" ry="3.1" fill="${ink}"/>
				<ellipse cx="${rx}" cy="${y + 0.8}" rx="2.6" ry="3.1" fill="${ink}"/>
				<circle cx="${lx + 0.9}" cy="${y - 0.4}" r="0.8" fill="#fff"/>
				<circle cx="${rx + 0.9}" cy="${y - 0.4}" r="0.8" fill="#fff"/>
			`;
		case "sleeping":
			return (
				lash(`M ${lx - 3.6} ${y} Q ${lx} ${y + 3} ${lx + 3.6} ${y}`, 2) +
				lash(`M ${rx - 3.6} ${y} Q ${rx} ${y + 3} ${rx + 3.6} ${y}`, 2)
			);
		case "sad":
			// Worried/unwell: smaller eyes looking down + inner-raised "◠" brows.
			// (Distinct from pill-time, which adds the pill icon + neutral mouth.)
			return `
				<ellipse cx="${lx}" cy="${y + 0.8}" rx="3.8" ry="4.1" fill="${ring}" stroke="#3a2c1e" stroke-width="0.6"/>
				<ellipse cx="${rx}" cy="${y + 0.8}" rx="3.8" ry="4.1" fill="${ring}" stroke="#3a2c1e" stroke-width="0.6"/>
				<ellipse cx="${lx}" cy="${y + 1.6}" rx="2.6" ry="2.9" fill="${ink}"/>
				<ellipse cx="${rx}" cy="${y + 1.6}" rx="2.6" ry="2.9" fill="${ink}"/>
				<circle cx="${lx + 0.8}" cy="${y + 0.2}" r="0.7" fill="#fff"/>
				<circle cx="${rx + 0.8}" cy="${y + 0.2}" r="0.7" fill="#fff"/>
				${lash(`M ${lx - 4} ${y - 5} Q ${lx + 1} ${y - 6.6} ${lx + 4} ${y - 3.8}`, 1.5)}
				${lash(`M ${rx - 4} ${y - 3.8} Q ${rx - 1} ${y - 6.6} ${rx + 4} ${y - 5}`, 1.5)}
			`;
		default:
			// idle — eyebrows-relaxed, big round eyes
			return `${open(lx)}${open(rx)}`;
	}
}

// ---- nose + mouth (per state) ----
function muzzleFeatures(state: SpriteState, p: Parts, g: Geom): string {
	const cx = g.cx;
	const ny = g.noseY;
	const my = g.mouthY;
	const nose = `<path d="M ${cx - 3} ${ny - 1.4} Q ${cx} ${ny - 3} ${cx + 3} ${ny - 1.4} Q ${cx + 2} ${ny + 2.2} ${cx} ${ny + 2.8} Q ${cx - 2} ${ny + 2.2} ${cx - 3} ${ny - 1.4} Z" fill="${p.nose}"/>
		<ellipse cx="${cx - 1}" cy="${ny - 1}" rx="0.8" ry="0.5" fill="#fff" opacity="0.5"/>`;
	let mouth = "";
	switch (state) {
		case "happy":
			mouth = `<path d="M ${cx} ${ny + 3} Q ${cx - 3} ${my + 2} ${cx - 6} ${my - 1}" stroke="${p.feat}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
				<path d="M ${cx} ${ny + 3} Q ${cx + 3} ${my + 2} ${cx + 6} ${my - 1}" stroke="${p.feat}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
				<path d="M ${cx - 3.5} ${my + 0.5} Q ${cx} ${my + 4} ${cx + 3.5} ${my + 0.5} Z" fill="${p.tongue}" opacity="0.9"/>`;
			break;
		case "hungry":
			mouth = `<path d="M ${cx} ${ny + 3} L ${cx} ${my - 1.5}" stroke="${p.feat}" stroke-width="1.5" stroke-linecap="round"/>
				<path d="M ${cx - 4.5} ${my - 1} Q ${cx} ${my + 5} ${cx + 4.5} ${my - 1} Q ${cx} ${my + 1.5} ${cx - 4.5} ${my - 1} Z" fill="${p.feat}"/>
				<ellipse cx="${cx}" cy="${my + 2}" rx="2.8" ry="1.8" fill="${p.tongue}"/>`;
			break;
		case "pill-time":
			mouth = `<path d="M ${cx} ${ny + 3} L ${cx} ${my - 2}" stroke="${p.feat}" stroke-width="1.5" stroke-linecap="round"/>
				<path d="M ${cx - 4} ${my} Q ${cx} ${my - 1.5} ${cx + 4} ${my}" stroke="${p.feat}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
			break;
		case "sleeping":
			mouth = `<path d="M ${cx} ${ny + 3} L ${cx} ${my - 2}" stroke="${p.feat}" stroke-width="1.3" stroke-linecap="round" opacity="0.7"/>
				<path d="M ${cx - 3} ${my - 0.5} Q ${cx} ${my + 1.5} ${cx + 3} ${my - 0.5}" stroke="${p.feat}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
			break;
		case "sad":
			// Downturned frown (corners pulled down).
			mouth = `<path d="M ${cx} ${ny + 3} L ${cx} ${my - 1.5}" stroke="${p.feat}" stroke-width="1.4" stroke-linecap="round"/>
				<path d="M ${cx - 4} ${my + 1.6} Q ${cx} ${my - 1.2} ${cx + 4} ${my + 1.6}" stroke="${p.feat}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
			break;
		default:
			// idle — gentle cat/dog "ω" under the nose
			mouth = `<path d="M ${cx} ${ny + 3} L ${cx} ${my - 1.5}" stroke="${p.feat}" stroke-width="1.4" stroke-linecap="round"/>
				<path d="M ${cx} ${my - 1.5} Q ${cx - 2.4} ${my + 1.5} ${cx - 4.5} ${my - 0.5}" stroke="${p.feat}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
				<path d="M ${cx} ${my - 1.5} Q ${cx + 2.4} ${my + 1.5} ${cx + 4.5} ${my - 0.5}" stroke="${p.feat}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
	}
	return `${nose}\n${mouth}`;
}

function cheeks(state: SpriteState, p: Parts, g: Geom): string {
	// Soft blush: a radial gradient that fades to transparent, so there's no
	// hard pink edge (and it sits gently over the tan cheek fur). Per-state id
	// to stay unique across the sprites on a page.
	const peak =
		state === "happy"
			? 0.42
			: state === "sleeping"
				? 0.26
				: state === "sad"
					? 0.2
					: 0.34;
	const r = state === "happy" ? 4 : 3.4;
	const y = g.eyeY + 5.5;
	const dx = g.eyeDx + 3;
	const gid = `blush-${state}`;
	return `
		<defs>
			<radialGradient id="${gid}">
				<stop offset="0%" stop-color="${p.blush}" stop-opacity="${peak}"/>
				<stop offset="55%" stop-color="${p.blush}" stop-opacity="${peak * 0.45}"/>
				<stop offset="100%" stop-color="${p.blush}" stop-opacity="0"/>
			</radialGradient>
		</defs>
		<ellipse cx="${g.cx - dx}" cy="${y}" rx="${r}" ry="${r * 0.82}" fill="url(#${gid})"/>
		<ellipse cx="${g.cx + dx}" cy="${y}" rx="${r}" ry="${r * 0.82}" fill="url(#${gid})"/>
	`;
}

function extras(state: SpriteState, g: Geom): string {
	if (state === "sleeping") {
		const ex = g.cx + g.domeRx + 1;
		const ey = g.domeCy - g.domeRy + 4;
		return `
			<text x="${ex}" y="${ey + 6}" font-family="ui-monospace,monospace" font-weight="700" font-size="8" fill="#6b8cc8">z</text>
			<text x="${ex + 4}" y="${ey}" font-family="ui-monospace,monospace" font-weight="700" font-size="6" fill="#6b8cc8">z</text>
		`;
	}
	if (state === "pill-time") {
		const px = g.cx + g.domeRx - 1;
		const py = g.muzzleCy - 4;
		return `
			<rect x="${px}" y="${py}" width="8" height="3.6" rx="1.8" fill="#f5c2c7"/>
			<rect x="${px + 4}" y="${py}" width="4" height="3.6" rx="1.8" fill="#a1d2ce"/>
		`;
	}
	if (state === "hungry") {
		const dx = g.cx + 5;
		const dy = g.mouthY + 1.5;
		return `<path d="M ${dx} ${dy} q 1.4 2.6 -0.8 3.6 q -1.4 -1 0.8 -3.6 z" fill="#9bd0e6" opacity="0.85"/>`;
	}
	if (state === "sad") {
		// A single teardrop under the left eye — the "unwell" cue.
		const tx = g.cx - g.eyeDx - 0.5;
		const ty = g.eyeY + 5.5;
		return `<path d="M ${tx} ${ty} q 1.5 2.8 -0.9 3.9 q -1.5 -1.1 0.9 -3.9 z" fill="#7fb4e0" opacity="0.9"/>`;
	}
	return "";
}

// ---------- Top-level render ----------

export function renderSpriteSvg(
	character: CharacterSheet,
	state: SpriteState,
): string {
	const { p: rawP, t } = analyze(character);
	const p = rawP as PartsX;
	p.hasCapEnabled = t.hasCap;
	const g = geomFor(character);
	const droop = state === "sleeping" ? 1.5 : 0;
	const gradId = `head-${state}`;
	const haloColor = lighten(p.body, 0.08);

	// The composition (esp. tall ears) sits high in the 0..64 box. Nudge the
	// whole drawing down so the ears aren't clipped at the top and the slack is
	// shared top/bottom rather than pooling under the chin.
	const shift = 7;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" preserveAspectRatio="xMidYMid meet">
<defs>
<radialGradient id="${gradId}" cx="42%" cy="34%" r="72%">
<stop offset="0%" stop-color="${p.bodyLight}"/>
<stop offset="68%" stop-color="${p.body}"/>
<stop offset="100%" stop-color="${p.bodyShade}"/>
</radialGradient>
</defs>
<g transform="translate(0 ${shift})">
${t.longCoat ? furHalo(g, haloColor) : ""}
${ears(character, p, t, g, droop)}
${head(p, g, gradId)}
${coat(p, g)}
${cheeks(state, p, g)}
${eyes(state, p, g)}
${muzzleFeatures(state, p, g)}
${extras(state, g)}
</g>
</svg>`;
}

export function renderSpritePack(
	character: CharacterSheet,
): Record<SpriteState, string> {
	const out = {} as Record<SpriteState, string>;
	for (const s of STATES) out[s] = renderSpriteSvg(character, s);
	return out;
}
