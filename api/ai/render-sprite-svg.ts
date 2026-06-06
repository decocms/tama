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
	| "sad"
	| "sleeping";

const STATES: SpriteState[] = [
	"idle",
	"happy",
	"hungry",
	"pill-time",
	"sad",
	"sleeping",
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

	const nose = bodyDark ? "#1c1814" : "#3a2c24";
	const p: Parts = {
		body,
		bodyLight: lighten(body, bodyDark ? 0.22 : 0.14),
		bodyShade: shade(body, 0.86),
		patch,
		patchInner: patch ? lighten(patch, 0.16) : "#caa",
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
	const domeRx = long ? 15.5 : boxy ? 19 : 17.5;
	const domeRy = long ? 16 : boxy ? 14.5 : 15.5;
	return {
		cx: 32,
		domeCy: 27,
		domeRx,
		domeRy,
		muzzleCy: 41,
		muzzleRx: boxy ? 11.5 : 10,
		muzzleRy: 8.5,
		eyeY: 29.5,
		eyeDx: 8.8,
		noseY: 39,
		mouthY: 44,
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
		const wave = i % 2 === 0 ? 1 : 0.45; // gentle, not jagged
		// How far the coat pools: minimal on top, fullest at sides + bottom.
		const region = s < -0.2 ? 0.4 : s > 0.3 ? 1 : 0.8;
		const out = 1.2 + 3.4 * region * wave;
		const rx = g.domeRx + 1 + out;
		const ry = g.domeRy + 3 + out * (s > 0.3 ? 1.4 : 1); // longer chest fluff
		const x = g.cx + Math.cos(a) * rx;
		const y = g.domeCy + 5 + s * ry;
		pts.push(`${r2(x)},${r2(y)}`);
	}
	return `<polygon points="${pts.join(" ")}" fill="${color}" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
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
	const w = big ? 9 : 7; // half-width at base
	const h = big ? 18 : 14; // height above the dome
	const baseY = g.domeCy - g.domeRy * 0.55 + dy;
	const lbx = g.cx - g.domeRx * 0.62;
	const rbx = g.cx + g.domeRx * 0.62;
	const tip = (bx: number, dir: number) =>
		`M ${r2(bx - w * 0.3)} ${r2(baseY + 2)} Q ${r2(bx - dir * w * 1.1)} ${r2(baseY - h * 0.55)} ${r2(bx - dir * w * 0.5)} ${r2(baseY - h)} Q ${r2(bx + dir * w * 0.2)} ${r2(baseY - h * 0.7)} ${r2(bx + w * 0.7)} ${r2(baseY + 2)} Z`;
	const inner = (bx: number, dir: number) =>
		`M ${r2(bx - w * 0.1)} ${r2(baseY)} Q ${r2(bx - dir * w * 0.55)} ${r2(baseY - h * 0.5)} ${r2(bx - dir * w * 0.32)} ${r2(baseY - h * 0.78)} Q ${r2(bx + dir * w * 0.1)} ${r2(baseY - h * 0.55)} ${r2(bx + w * 0.35)} ${r2(baseY)} Z`;
	const fur = t.longCoat
		? `
			<path d="${tip(lbx, 1)}" fill="${p.bodyLight}" opacity="0.5" transform="translate(-1 1) scale(1.06)" transform-origin="${lbx} ${baseY}"/>
			<path d="${tip(rbx, -1)}" fill="${p.bodyLight}" opacity="0.5" transform="translate(1 1) scale(1.06)" transform-origin="${rbx} ${baseY}"/>`
		: "";
	return `
		${fur}
		<path d="${tip(lbx, 1)}" fill="${earFill}"/>
		<path d="${tip(rbx, -1)}" fill="${earFill}"/>
		<path d="${inner(lbx, 1)}" fill="${p.earInner}" opacity="0.85"/>
		<path d="${inner(rbx, -1)}" fill="${p.earInner}" opacity="0.85"/>
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
		// Dark cap arcing over the top of the head, dipping low at the temples.
		out.push(
			`<path d="M ${cx - g.domeRx * 0.96} ${g.domeCy + 1} Q ${cx - g.domeRx} ${top + 1} ${cx} ${top - 1} Q ${cx + g.domeRx} ${top + 1} ${cx + g.domeRx * 0.96} ${g.domeCy + 1} Q ${cx + g.domeRx * 0.5} ${g.domeCy + 5} ${cx} ${g.domeCy + 4} Q ${cx - g.domeRx * 0.5} ${g.domeCy + 5} ${cx - g.domeRx * 0.96} ${g.domeCy + 1} Z" fill="${p.patch}"/>`,
		);
		// White blaze down the centre of the forehead.
		out.push(
			`<path d="M ${cx} ${top + 2} Q ${cx - 3.4} ${g.domeCy} ${cx - 2.6} ${g.domeCy + 7} Q ${cx} ${g.domeCy + 10} ${cx + 2.6} ${g.domeCy + 7} Q ${cx + 3.4} ${g.domeCy} ${cx} ${top + 2} Z" fill="${p.muzzle}"/>`,
		);
	}
	// Light muzzle/chin area (always — gives the snout definition).
	out.push(
		`<ellipse cx="${cx}" cy="${g.muzzleCy + 0.5}" rx="${g.muzzleRx - 0.5}" ry="${g.muzzleRy - 0.5}" fill="${p.muzzle}" opacity="0.92"/>`,
	);
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
	const open = (ex: number) => `
		<ellipse cx="${ex}" cy="${y}" rx="4" ry="4.6" fill="#fff" opacity="0.55"/>
		<ellipse cx="${ex}" cy="${y}" rx="3.5" ry="4.2" fill="${ink}"/>
		<circle cx="${ex + 1.2}" cy="${y - 1.4}" r="1.25" fill="#fff"/>
		<circle cx="${ex - 1}" cy="${y + 1.3}" r="0.6" fill="#fff" opacity="0.6"/>
	`;
	switch (state) {
		case "happy":
			return `
				<path d="M ${lx - 4} ${y + 1.5} Q ${lx} ${y - 4.5} ${lx + 4} ${y + 1.5}" stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
				<path d="M ${rx - 4} ${y + 1.5} Q ${rx} ${y - 4.5} ${rx + 4} ${y + 1.5}" stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
			`;
		case "hungry":
			return `${open(lx)}${open(rx)}
				<circle cx="${lx + 1.8}" cy="${y - 2}" r="0.8" fill="#fff"/>
				<circle cx="${rx + 1.8}" cy="${y - 2}" r="0.8" fill="#fff"/>`;
		case "pill-time":
			return `
				<path d="M ${lx - 4} ${y - 3.5} Q ${lx} ${y - 6} ${lx + 4} ${y - 4}" stroke="${ink}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
				<path d="M ${rx - 4} ${y - 4} Q ${rx} ${y - 6} ${rx + 4} ${y - 3.5}" stroke="${ink}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
				<ellipse cx="${lx}" cy="${y + 0.5}" rx="2.8" ry="3.4" fill="${ink}"/>
				<ellipse cx="${rx}" cy="${y + 0.5}" rx="2.8" ry="3.4" fill="${ink}"/>
				<circle cx="${lx + 1}" cy="${y - 0.6}" r="0.9" fill="#fff"/>
				<circle cx="${rx + 1}" cy="${y - 0.6}" r="0.9" fill="#fff"/>
			`;
		case "sad":
			return `
				<path d="M ${lx - 3.5} ${y - 1.5} Q ${lx} ${y + 3} ${lx + 3.5} ${y - 1}" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
				<path d="M ${rx - 3.5} ${y - 1} Q ${rx} ${y + 3} ${rx + 3.5} ${y - 1.5}" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
				<ellipse cx="${lx - 1}" cy="${y + 5}" rx="1.7" ry="2.8" fill="#7ec0e0" opacity="0.9"/>
			`;
		case "sleeping":
			return `
				<path d="M ${lx - 3.6} ${y} Q ${lx} ${y + 3} ${lx + 3.6} ${y}" stroke="${ink}" stroke-width="2.1" fill="none" stroke-linecap="round"/>
				<path d="M ${rx - 3.6} ${y} Q ${rx} ${y + 3} ${rx + 3.6} ${y}" stroke="${ink}" stroke-width="2.1" fill="none" stroke-linecap="round"/>
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
		case "sad":
			mouth = `<path d="M ${cx} ${ny + 3} L ${cx} ${my - 2}" stroke="${p.feat}" stroke-width="1.5" stroke-linecap="round"/>
				<path d="M ${cx - 4.5} ${my + 2.5} Q ${cx} ${my - 2.5} ${cx + 4.5} ${my + 2.5}" stroke="${p.feat}" stroke-width="1.9" fill="none" stroke-linecap="round"/>`;
			break;
		case "sleeping":
			mouth = `<path d="M ${cx} ${ny + 3} L ${cx} ${my - 2}" stroke="${p.feat}" stroke-width="1.3" stroke-linecap="round" opacity="0.7"/>
				<path d="M ${cx - 3} ${my - 0.5} Q ${cx} ${my + 1.5} ${cx + 3} ${my - 0.5}" stroke="${p.feat}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
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
	if (state === "sad") return "";
	const op = state === "sleeping" ? 0.3 : 0.42;
	const r = state === "happy" ? 3.2 : 2.7;
	const y = g.eyeY + 6;
	const dx = g.eyeDx + 3.5;
	return `
		<ellipse cx="${g.cx - dx}" cy="${y}" rx="${r}" ry="${r * 0.66}" fill="${p.blush}" opacity="${op}"/>
		<ellipse cx="${g.cx + dx}" cy="${y}" rx="${r}" ry="${r * 0.66}" fill="${p.blush}" opacity="${op}"/>
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
	const droop = state === "sad" ? 3 : state === "sleeping" ? 1.5 : 0;
	const gradId = `head-${state}`;
	const haloColor = lighten(p.body, 0.08);

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" preserveAspectRatio="xMidYMid meet">
<defs>
<radialGradient id="${gradId}" cx="42%" cy="34%" r="72%">
<stop offset="0%" stop-color="${p.bodyLight}"/>
<stop offset="68%" stop-color="${p.body}"/>
<stop offset="100%" stop-color="${p.bodyShade}"/>
</radialGradient>
</defs>
${t.longCoat ? furHalo(g, haloColor) : ""}
${ears(character, p, t, g, droop)}
${head(p, g, gradId)}
${coat(p, g)}
${cheeks(state, p, g)}
${eyes(state, p, g)}
${muzzleFeatures(state, p, g)}
${extras(state, g)}
</svg>`;
}

export function renderSpritePack(
	character: CharacterSheet,
): Record<SpriteState, string> {
	const out = {} as Record<SpriteState, string>;
	for (const s of STATES) out[s] = renderSpriteSvg(character, s);
	return out;
}
