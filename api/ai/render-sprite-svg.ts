// Procedural SVG sprite renderer. Trades the magic of img2img for
// determinism, instant generation, free, and crisp at any size.
//
// Same input as the raster pipeline: a CharacterSheet produced by Claude
// vision on the source photo. The geometry is hand-tuned for a soft
// kawaii face that reads as the same creature across all 6 expressions
// — eyes/mouth/ears/extras change per state, head and markings stay put.
//
// Everything is built from ellipses and bezier curves — no axis-aligned
// rectangles — so the face reads as a soft, round little creature rather
// than a blocky one. All sprites share the same 64×64 viewBox so they
// composite identically with the breathing animation.

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
// salient color word; unknowns fall back to a warm tan that doesn't
// scream "missing data".
const COLOR_WORDS: Record<string, string> = {
	cream: "#ecd4b4",
	tan: "#d6ab7e",
	beige: "#dcc4a1",
	gold: "#dba75a",
	golden: "#dba75a",
	ginger: "#d68646",
	orange: "#e08b4a",
	red: "#b85a3a",
	brown: "#9a6a44",
	chocolate: "#6b4423",
	black: "#3a2f25",
	white: "#f4ece0",
	gray: "#a8a098",
	grey: "#a8a098",
	silver: "#c8c0b8",
	yellow: "#e3b85a",
	caramel: "#b87844",
	chestnut: "#8b5a3c",
};

function pickColor(desc: string | null | undefined, fallback: string): string {
	if (!desc) return fallback;
	const lower = desc.toLowerCase();
	for (const [word, hex] of Object.entries(COLOR_WORDS)) {
		if (lower.includes(word)) return hex;
	}
	return fallback;
}

// Mix a hex color toward black (amount<1) or white (amount>1 blends to white).
function shade(hex: string, amount = 0.82): string {
	const m = hex.match(/^#([0-9a-f]{6})$/i);
	if (!m) return hex;
	const n = Number.parseInt(m[1], 16);
	const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 0xff) * amount)));
	const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 0xff) * amount)));
	const b = Math.max(0, Math.min(255, Math.round((n & 0xff) * amount)));
	return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function lighten(hex: string, amount = 0.18): string {
	const m = hex.match(/^#([0-9a-f]{6})$/i);
	if (!m) return hex;
	const n = Number.parseInt(m[1], 16);
	const mix = (c: number) => Math.round(c + (255 - c) * amount);
	const r = mix((n >> 16) & 0xff);
	const g = mix((n >> 8) & 0xff);
	const b = mix(n & 0xff);
	return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

interface RenderParts {
	body: string;
	bodyLight: string;
	bodyShade: string;
	earInner: string;
	feat: string;
	blush: string;
	tongue: string;
}

function partsFor(character: CharacterSheet): RenderParts {
	const body = pickColor(character.primaryColor, "#d6ab7e");
	return {
		body,
		bodyLight: lighten(body, 0.16),
		bodyShade: shade(body, 0.86),
		earInner: "#f3bda6",
		feat: "#392c22",
		blush: "#f0939d",
		tongue: "#ec6b80",
	};
}

// Head geometry is parameterised so features (eyes/mouth) can be placed
// relative to the same center across all states and head shapes.
interface HeadGeom {
	cx: number;
	cy: number;
	rx: number;
	ry: number;
}

function headGeom(character: CharacterSheet): HeadGeom {
	const shape = (character.headShape ?? "").toLowerCase();
	if (shape.includes("long") || shape.includes("narrow")) {
		return { cx: 32, cy: 35, rx: 16, ry: 21 };
	}
	if (shape.includes("boxy") || shape.includes("square") || shape.includes("broad")) {
		return { cx: 32, cy: 34, rx: 21, ry: 18 };
	}
	// default: round/compact
	return { cx: 32, cy: 34, rx: 19, ry: 19 };
}

// ---------- Ear shapes (parametric, all rounded) ----------

function ears(character: CharacterSheet, p: RenderParts, g: HeadGeom, droop = 0): string {
	const dy = droop;
	const lx = g.cx - g.rx + 3; // left ear anchor x
	const rx = g.cx + g.rx - 3; // right ear anchor x
	const top = g.cy - g.ry; // head crown y
	switch (character.earShape) {
		case "floppy":
			// Long soft drooping ears hanging beside the head.
			return `
				<path d="M ${lx} ${top + 2 + dy} C ${lx - 9} ${top + 6 + dy}, ${lx - 9} ${top + 22 + dy}, ${lx + 1} ${top + 26 + dy} C ${lx + 4} ${top + 18 + dy}, ${lx + 4} ${top + 8 + dy}, ${lx} ${top + 2 + dy} Z" fill="${p.bodyShade}"/>
				<path d="M ${rx} ${top + 2 + dy} C ${rx + 9} ${top + 6 + dy}, ${rx + 9} ${top + 22 + dy}, ${rx - 1} ${top + 26 + dy} C ${rx - 4} ${top + 18 + dy}, ${rx - 4} ${top + 8 + dy}, ${rx} ${top + 2 + dy} Z" fill="${p.bodyShade}"/>
				<path d="M ${lx - 1} ${top + 8 + dy} C ${lx - 5} ${top + 12 + dy}, ${lx - 5} ${top + 20 + dy}, ${lx} ${top + 23 + dy}" fill="${p.earInner}" opacity="0.65"/>
				<path d="M ${rx + 1} ${top + 8 + dy} C ${rx + 5} ${top + 12 + dy}, ${rx + 5} ${top + 20 + dy}, ${rx} ${top + 23 + dy}" fill="${p.earInner}" opacity="0.65"/>
			`;
		case "folded":
			// Small folded-over ears (Scottish-fold style).
			return `
				<path d="M ${lx + 2} ${top + 4 + dy} C ${lx - 4} ${top - 1 + dy}, ${lx + 6} ${top + 9 + dy}, ${lx + 9} ${top + 8 + dy} C ${lx + 5} ${top + 11 + dy}, ${lx} ${top + 9 + dy}, ${lx + 2} ${top + 4 + dy} Z" fill="${p.body}"/>
				<path d="M ${rx - 2} ${top + 4 + dy} C ${rx + 4} ${top - 1 + dy}, ${rx - 6} ${top + 9 + dy}, ${rx - 9} ${top + 8 + dy} C ${rx - 5} ${top + 11 + dy}, ${rx} ${top + 9 + dy}, ${rx - 2} ${top + 4 + dy} Z" fill="${p.body}"/>
			`;
		case "round":
			return `
				<circle cx="${lx + 2}" cy="${top + 5 + dy}" r="6" fill="${p.body}"/>
				<circle cx="${rx - 2}" cy="${top + 5 + dy}" r="6" fill="${p.body}"/>
				<circle cx="${lx + 2}" cy="${top + 5 + dy}" r="3" fill="${p.earInner}" opacity="0.8"/>
				<circle cx="${rx - 2}" cy="${top + 5 + dy}" r="3" fill="${p.earInner}" opacity="0.8"/>
			`;
		case "tufted":
			// Lynx-like tufts: rounded triangles with a soft curved tip.
			return `
				<path d="M ${lx} ${top + 13 + dy} C ${lx - 2} ${top - 4 + dy}, ${lx + 6} ${top - 4 + dy}, ${lx + 7} ${top + 11 + dy} Z" fill="${p.body}"/>
				<path d="M ${rx} ${top + 13 + dy} C ${rx + 2} ${top - 4 + dy}, ${rx - 6} ${top - 4 + dy}, ${rx - 7} ${top + 11 + dy} Z" fill="${p.body}"/>
				<path d="M ${lx + 1} ${top + 10 + dy} C ${lx} ${top + 2 + dy}, ${lx + 4} ${top + 2 + dy}, ${lx + 5} ${top + 9 + dy} Z" fill="${p.earInner}" opacity="0.8"/>
				<path d="M ${rx - 1} ${top + 10 + dy} C ${rx} ${top + 2 + dy}, ${rx - 4} ${top + 2 + dy}, ${rx - 5} ${top + 9 + dy} Z" fill="${p.earInner}" opacity="0.8"/>
			`;
		default:
			// pointy or unknown — upright ear with a softly rounded tip.
			return `
				<path d="M ${lx} ${top + 12 + dy} C ${lx - 3} ${top - 2 + dy}, ${lx + 5} ${top - 3 + dy}, ${lx + 8} ${top + 10 + dy} Z" fill="${p.body}"/>
				<path d="M ${rx} ${top + 12 + dy} C ${rx + 3} ${top - 2 + dy}, ${rx - 5} ${top - 3 + dy}, ${rx - 8} ${top + 10 + dy} Z" fill="${p.body}"/>
				<path d="M ${lx + 1} ${top + 9 + dy} C ${lx} ${top + 2 + dy}, ${lx + 4} ${top + 2 + dy}, ${lx + 6} ${top + 8 + dy} Z" fill="${p.earInner}" opacity="0.8"/>
				<path d="M ${rx - 1} ${top + 9 + dy} C ${rx} ${top + 2 + dy}, ${rx - 4} ${top + 2 + dy}, ${rx - 6} ${top + 8 + dy} Z" fill="${p.earInner}" opacity="0.8"/>
			`;
	}
}

// ---------- Head shape (soft ellipse + jowls + chin shadow) ----------

function head(_character: CharacterSheet, p: RenderParts, g: HeadGeom): string {
	// A round head with two soft cheek-jowls bulging at the lower sides and a
	// gentle muzzle shadow — all curves, no rectangles.
	const jowlY = g.cy + g.ry * 0.42;
	return `
		<ellipse cx="${g.cx}" cy="${g.cy}" rx="${g.rx}" ry="${g.ry}" fill="${p.body}"/>
		<path d="M ${g.cx - g.rx * 0.9} ${jowlY} Q ${g.cx - g.rx * 0.6} ${jowlY + 7} ${g.cx - g.rx * 0.15} ${jowlY + 6}" fill="none"/>
		<ellipse cx="${g.cx - g.rx * 0.6}" cy="${jowlY + 2}" rx="${g.rx * 0.42}" ry="${g.ry * 0.34}" fill="${p.bodyLight}" opacity="0.45"/>
		<ellipse cx="${g.cx + g.rx * 0.6}" cy="${jowlY + 2}" rx="${g.rx * 0.42}" ry="${g.ry * 0.34}" fill="${p.bodyLight}" opacity="0.45"/>
		<ellipse cx="${g.cx}" cy="${g.cy + g.ry * 0.18}" rx="${g.rx * 0.62}" ry="${g.ry * 0.5}" fill="${p.bodyLight}" opacity="0.5"/>
		<path d="M ${g.cx - g.rx * 0.5} ${g.cy + g.ry * 0.74} Q ${g.cx} ${g.cy + g.ry * 0.98} ${g.cx + g.rx * 0.5} ${g.cy + g.ry * 0.74}" stroke="${p.bodyShade}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.55"/>
	`;
}

// ---------- Markings overlay ----------

function markings(character: CharacterSheet, p: RenderParts, g: HeadGeom): string {
	const out: string[] = [];
	for (const m of character.markings ?? []) {
		const text = m.toLowerCase();
		if (
			text.includes("white") &&
			(text.includes("blaze") || text.includes("muzzle") || text.includes("chest"))
		) {
			// Soft white blaze running down the muzzle.
			out.push(
				`<path d="M ${g.cx} ${g.cy - g.ry * 0.5} C ${g.cx - 4} ${g.cy + g.ry * 0.2}, ${g.cx - 5} ${g.cy + g.ry * 0.7}, ${g.cx} ${g.cy + g.ry * 0.85} C ${g.cx + 5} ${g.cy + g.ry * 0.7}, ${g.cx + 4} ${g.cy + g.ry * 0.2}, ${g.cx} ${g.cy - g.ry * 0.5} Z" fill="#f6efe4" opacity="0.92"/>`,
			);
		}
		if (text.includes("mask")) {
			out.push(
				`<ellipse cx="${g.cx}" cy="${g.cy - g.ry * 0.18}" rx="${g.rx * 0.78}" ry="${g.ry * 0.3}" fill="${p.feat}" opacity="0.32"/>`,
			);
		}
		if (text.includes("spot")) {
			out.push(
				`<circle cx="${g.cx - g.rx * 0.55}" cy="${g.cy + g.ry * 0.32}" r="2.6" fill="${p.feat}" opacity="0.4"/>`,
			);
			out.push(
				`<circle cx="${g.cx + g.rx * 0.5}" cy="${g.cy + g.ry * 0.4}" r="2.1" fill="${p.feat}" opacity="0.4"/>`,
			);
		}
	}
	return out.join("\n");
}

// ---------- Per-state features ----------
// All positions are derived from the head geometry so features sit correctly
// on any head shape. Eye line ~ -12% of ry above center; nose at center+18%.

interface FeatGeom {
	eyeY: number;
	eyeDx: number;
	noseY: number;
	mouthY: number;
}

function featGeom(g: HeadGeom): FeatGeom {
	return {
		eyeY: g.cy - g.ry * 0.16,
		eyeDx: g.rx * 0.42,
		noseY: g.cy + g.ry * 0.18,
		mouthY: g.cy + g.ry * 0.36,
	};
}

function eyes(state: SpriteState, p: RenderParts, g: HeadGeom, f: FeatGeom): string {
	const lx = g.cx - f.eyeDx;
	const rx = g.cx + f.eyeDx;
	const y = f.eyeY;
	switch (state) {
		case "happy":
			return `
				<path d="M ${lx - 3} ${y + 1} Q ${lx} ${y - 4} ${lx + 3} ${y + 1}" stroke="${p.feat}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
				<path d="M ${rx - 3} ${y + 1} Q ${rx} ${y - 4} ${rx + 3} ${y + 1}" stroke="${p.feat}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
			`;
		case "hungry":
			return `
				<ellipse cx="${lx}" cy="${y}" rx="3.4" ry="3.8" fill="${p.feat}"/>
				<ellipse cx="${rx}" cy="${y}" rx="3.4" ry="3.8" fill="${p.feat}"/>
				<circle cx="${lx + 1.1}" cy="${y - 1.2}" r="1.3" fill="#fff"/>
				<circle cx="${rx + 1.1}" cy="${y - 1.2}" r="1.3" fill="#fff"/>
			`;
		case "pill-time":
			return `
				<path d="M ${lx - 3.5} ${y - 3} Q ${lx} ${y - 5} ${lx + 3.5} ${y - 3.5}" stroke="${p.feat}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
				<path d="M ${rx - 3.5} ${y - 3.5} Q ${rx} ${y - 5} ${rx + 3.5} ${y - 3}" stroke="${p.feat}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
				<ellipse cx="${lx}" cy="${y + 0.5}" rx="2.2" ry="2.8" fill="${p.feat}"/>
				<ellipse cx="${rx}" cy="${y + 0.5}" rx="2.2" ry="2.8" fill="${p.feat}"/>
			`;
		case "sad":
			return `
				<path d="M ${lx - 3} ${y - 1} Q ${lx} ${y + 3} ${lx + 3} ${y - 1}" stroke="${p.feat}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
				<path d="M ${rx - 3} ${y - 1} Q ${rx} ${y + 3} ${rx + 3} ${y - 1}" stroke="${p.feat}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
				<ellipse cx="${lx - 1}" cy="${y + 5}" rx="1.6" ry="2.6" fill="#7ec0e0" opacity="0.85"/>
			`;
		case "sleeping":
			return `
				<path d="M ${lx - 3} ${y} Q ${lx} ${y + 2.5} ${lx + 3} ${y}" stroke="${p.feat}" stroke-width="2" fill="none" stroke-linecap="round"/>
				<path d="M ${rx - 3} ${y} Q ${rx} ${y + 2.5} ${rx + 3} ${y}" stroke="${p.feat}" stroke-width="2" fill="none" stroke-linecap="round"/>
			`;
		default:
			// idle — round shiny eyes
			return `
				<ellipse cx="${lx}" cy="${y}" rx="2.7" ry="3.1" fill="${p.feat}"/>
				<ellipse cx="${rx}" cy="${y}" rx="2.7" ry="3.1" fill="${p.feat}"/>
				<circle cx="${lx + 0.9}" cy="${y - 1}" r="0.95" fill="#fff"/>
				<circle cx="${rx + 0.9}" cy="${y - 1}" r="0.95" fill="#fff"/>
			`;
	}
}

function nose(p: RenderParts, g: HeadGeom, f: FeatGeom): string {
	// A small soft heart-ish nose anchors the muzzle on every state.
	return `<path d="M ${g.cx - 2.4} ${f.noseY - 1} Q ${g.cx} ${f.noseY - 2.4} ${g.cx + 2.4} ${f.noseY - 1} Q ${g.cx + 1.6} ${f.noseY + 1.8} ${g.cx} ${f.noseY + 2.4} Q ${g.cx - 1.6} ${f.noseY + 1.8} ${g.cx - 2.4} ${f.noseY - 1} Z" fill="${p.feat}"/>`;
}

function mouth(state: SpriteState, p: RenderParts, g: HeadGeom, f: FeatGeom): string {
	const my = f.mouthY;
	switch (state) {
		case "happy":
			return `<path d="M ${g.cx - 6} ${my - 1} Q ${g.cx} ${my + 6} ${g.cx + 6} ${my - 1}" stroke="${p.feat}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
		case "hungry":
			return `
				<path d="M ${g.cx - 4.5} ${my - 1} Q ${g.cx} ${my + 5} ${g.cx + 4.5} ${my - 1} Q ${g.cx} ${my + 1} ${g.cx - 4.5} ${my - 1} Z" fill="${p.feat}"/>
				<ellipse cx="${g.cx}" cy="${my + 2}" rx="2.6" ry="1.7" fill="${p.tongue}"/>
			`;
		case "pill-time":
			return `<path d="M ${g.cx - 4} ${my + 1} Q ${g.cx} ${my - 1} ${g.cx + 4} ${my + 1}" stroke="${p.feat}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
		case "sad":
			return `<path d="M ${g.cx - 5} ${my + 3} Q ${g.cx} ${my - 3} ${g.cx + 5} ${my + 3}" stroke="${p.feat}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
		case "sleeping":
			return `<path d="M ${g.cx - 3.5} ${my} Q ${g.cx} ${my + 2.5} ${g.cx + 3.5} ${my}" stroke="${p.feat}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
		default:
			// idle — two tiny soft curves under the nose (a kitten "w")
			return `
				<path d="M ${g.cx} ${my - 1.5} Q ${g.cx - 2} ${my + 1.5} ${g.cx - 4} ${my}" stroke="${p.feat}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
				<path d="M ${g.cx} ${my - 1.5} Q ${g.cx + 2} ${my + 1.5} ${g.cx + 4} ${my}" stroke="${p.feat}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
			`;
	}
}

function cheeks(state: SpriteState, p: RenderParts, g: HeadGeom, f: FeatGeom): string {
	if (state === "sad" || state === "sleeping") {
		if (state === "sleeping") {
			// faint resting blush
			return `
				<ellipse cx="${g.cx - f.eyeDx - 2}" cy="${f.eyeY + 5}" rx="3" ry="2" fill="${p.blush}" opacity="0.35"/>
				<ellipse cx="${g.cx + f.eyeDx + 2}" cy="${f.eyeY + 5}" rx="3" ry="2" fill="${p.blush}" opacity="0.35"/>
			`;
		}
		return "";
	}
	const r = state === "happy" ? 3.4 : 2.9;
	return `
		<ellipse cx="${g.cx - f.eyeDx - 2}" cy="${f.eyeY + 5}" rx="${r}" ry="${r * 0.7}" fill="${p.blush}" opacity="0.5"/>
		<ellipse cx="${g.cx + f.eyeDx + 2}" cy="${f.eyeY + 5}" rx="${r}" ry="${r * 0.7}" fill="${p.blush}" opacity="0.5"/>
	`;
}

function extras(state: SpriteState, p: RenderParts, g: HeadGeom): string {
	if (state === "sleeping") {
		const ex = g.cx + g.rx + 2;
		const ey = g.cy - g.ry;
		return `
			<text x="${ex}" y="${ey + 6}" font-family="ui-monospace,monospace" font-weight="700" font-size="8" fill="#6b8cc8">z</text>
			<text x="${ex + 4}" y="${ey}" font-family="ui-monospace,monospace" font-weight="700" font-size="6" fill="#6b8cc8">z</text>
		`;
	}
	if (state === "pill-time") {
		const px = g.cx + g.rx;
		const py = g.cy + g.ry * 0.1;
		return `
			<rect x="${px}" y="${py}" width="7" height="3.4" rx="1.7" fill="#f5c2c7"/>
			<rect x="${px + 3.5}" y="${py}" width="3.5" height="3.4" rx="1.7" fill="#a1d2ce"/>
		`;
	}
	if (state === "hungry") {
		// a little drool drop at the corner of the mouth
		const dx = g.cx + 5;
		const dy = g.cy + g.ry * 0.36 + 2;
		return `<path d="M ${dx} ${dy} q 1.4 2.4 -0.7 3.4 q -1.4 -1 0.7 -3.4 z" fill="#9bd0e6" opacity="0.8"/>`;
	}
	return "";
}

// ---------- Top-level render ----------

export function renderSpriteSvg(
	character: CharacterSheet,
	state: SpriteState,
): string {
	const p = partsFor(character);
	const g = headGeom(character);
	const f = featGeom(g);
	const droop = state === "sad" ? 4 : state === "sleeping" ? 2 : 0;

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" preserveAspectRatio="xMidYMid meet">
${ears(character, p, g, droop)}
${head(character, p, g)}
${markings(character, p, g)}
${eyes(state, p, g, f)}
${nose(p, g, f)}
${cheeks(state, p, g, f)}
${mouth(state, p, g, f)}
${extras(state, p, g)}
</svg>`;
}

export function renderSpritePack(
	character: CharacterSheet,
): Record<SpriteState, string> {
	const out = {} as Record<SpriteState, string>;
	for (const s of STATES) {
		out[s] = renderSpriteSvg(character, s);
	}
	return out;
}
