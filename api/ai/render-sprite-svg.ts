// Procedural SVG sprite renderer. Trades the magic of img2img for
// determinism, instant generation, free, and crisp at any size.
//
// Same input as the raster pipeline: a CharacterSheet produced by Claude
// vision on the source photo. The geometry is hand-tuned for a soft
// kawaii face that reads as the same creature across all 6 expressions
// — eyes/mouth/ears/extras change per state, head and markings stay put.
//
// Output: one SVG string per state. The companion renders inline (no
// fetch, no R2, ~2 KB per sprite). All sprites share the same 64×64
// viewBox so they composite identically with the breathing animation.

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
	cream: "#e8c9a5",
	tan: "#d4a574",
	beige: "#dcc4a1",
	gold: "#dba75a",
	golden: "#dba75a",
	ginger: "#d68646",
	orange: "#e08b4a",
	red: "#b85a3a",
	brown: "#9a6a44",
	chocolate: "#6b4423",
	black: "#2a2017",
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

// Slightly darker version of the body color for the chin shadow.
function shade(hex: string, amount = 0.78): string {
	const m = hex.match(/^#([0-9a-f]{6})$/i);
	if (!m) return hex;
	const n = Number.parseInt(m[1], 16);
	const r = Math.max(0, Math.round(((n >> 16) & 0xff) * amount));
	const g = Math.max(0, Math.round(((n >> 8) & 0xff) * amount));
	const b = Math.max(0, Math.round((n & 0xff) * amount));
	return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

interface RenderParts {
	body: string;
	bodyShade: string;
	earInner: string;
	feat: string;
	blush: string;
	tongue: string;
}

function partsFor(character: CharacterSheet): RenderParts {
	const body = pickColor(character.primaryColor, "#d4a574");
	return {
		body,
		bodyShade: shade(body, 0.78),
		earInner: "#f4c0a8",
		feat: "#2a1f17",
		blush: "#f08a96",
		tongue: "#ec6b80",
	};
}

// ---------- Ear shapes (parametric) ----------

function ears(character: CharacterSheet, p: RenderParts, droop = 0): string {
	// `droop` shifts the ears down for sad/sleeping states.
	const dy = droop;
	switch (character.earShape) {
		case "floppy":
			// Soft drooping ears — long curves down the sides of the head.
			return `
				<path d="M 14 ${10 + dy} Q 10 ${20 + dy} 14 ${28 + dy} L 20 ${24 + dy} Z" fill="${p.body}"/>
				<path d="M 50 ${10 + dy} Q 54 ${20 + dy} 50 ${28 + dy} L 44 ${24 + dy} Z" fill="${p.body}"/>
				<path d="M 15 ${14 + dy} Q 13 ${22 + dy} 16 ${26 + dy}" fill="${p.earInner}" opacity="0.7"/>
				<path d="M 49 ${14 + dy} Q 51 ${22 + dy} 48 ${26 + dy}" fill="${p.earInner}" opacity="0.7"/>
			`;
		case "folded":
			// Folded-over ears (Scottish fold style).
			return `
				<path d="M 14 ${12 + dy} Q 18 ${8 + dy} 22 ${14 + dy} Q 20 ${20 + dy} 16 ${18 + dy} Z" fill="${p.body}"/>
				<path d="M 50 ${12 + dy} Q 46 ${8 + dy} 42 ${14 + dy} Q 44 ${20 + dy} 48 ${18 + dy} Z" fill="${p.body}"/>
			`;
		case "round":
			return `
				<circle cx="16" cy="${14 + dy}" r="5" fill="${p.body}"/>
				<circle cx="48" cy="${14 + dy}" r="5" fill="${p.body}"/>
				<circle cx="16" cy="${14 + dy}" r="2.5" fill="${p.earInner}"/>
				<circle cx="48" cy="${14 + dy}" r="2.5" fill="${p.earInner}"/>
			`;
		case "tufted":
			return `
				<polygon points="14,${4 + dy} 18,${4 + dy} 22,${18 + dy} 16,${20 + dy}" fill="${p.body}"/>
				<polygon points="50,${4 + dy} 46,${4 + dy} 42,${18 + dy} 48,${20 + dy}" fill="${p.body}"/>
				<polyline points="14,${4 + dy} 12,${0 + dy} 16,${2 + dy}" stroke="${p.body}" stroke-width="1.5" fill="none"/>
				<polyline points="50,${4 + dy} 52,${0 + dy} 48,${2 + dy}" stroke="${p.body}" stroke-width="1.5" fill="none"/>
				<polygon points="16,${10 + dy} 18,${10 + dy} 20,${18 + dy} 17,${19 + dy}" fill="${p.earInner}"/>
				<polygon points="48,${10 + dy} 46,${10 + dy} 44,${18 + dy} 47,${19 + dy}" fill="${p.earInner}"/>
			`;
		default:
			// pointy or unknown — classic triangular ear
			return `
				<polygon points="14,${8 + dy} 18,${8 + dy} 22,${18 + dy} 16,${20 + dy}" fill="${p.body}"/>
				<polygon points="50,${8 + dy} 46,${8 + dy} 42,${18 + dy} 48,${20 + dy}" fill="${p.body}"/>
				<polygon points="16,${14 + dy} 18,${14 + dy} 20,${18 + dy} 17,${19 + dy}" fill="${p.earInner}"/>
				<polygon points="48,${14 + dy} 46,${14 + dy} 44,${18 + dy} 47,${19 + dy}" fill="${p.earInner}"/>
			`;
	}
}

// ---------- Head shape ----------

function head(character: CharacterSheet, p: RenderParts): string {
	const shape = (character.headShape ?? "").toLowerCase();
	if (shape.includes("long") || shape.includes("narrow")) {
		return `
			<rect x="18" y="16" width="28" height="38" rx="8" fill="${p.body}"/>
			<rect x="18" y="46" width="28" height="8" rx="4" fill="${p.bodyShade}"/>
		`;
	}
	if (shape.includes("boxy") || shape.includes("square")) {
		return `
			<rect x="14" y="16" width="36" height="36" rx="3" fill="${p.body}"/>
			<rect x="14" y="44" width="36" height="8" rx="2" fill="${p.bodyShade}"/>
		`;
	}
	// default: round/compact
	return `
		<rect x="16" y="16" width="32" height="36" rx="6" fill="${p.body}"/>
		<rect x="16" y="44" width="32" height="8" rx="4" fill="${p.bodyShade}"/>
	`;
}

// ---------- Markings overlay ----------

function markings(character: CharacterSheet, _p: RenderParts): string {
	const out: string[] = [];
	for (const m of character.markings ?? []) {
		const text = m.toLowerCase();
		if (text.includes("white") && (text.includes("blaze") || text.includes("muzzle") || text.includes("chest"))) {
			out.push(`<path d="M 28 38 Q 32 50 36 38 L 36 50 L 28 50 Z" fill="#f4ece0" opacity="0.95"/>`);
		}
		if (text.includes("mask")) {
			out.push(`<rect x="18" y="26" width="28" height="10" rx="4" fill="#2a2017" opacity="0.6"/>`);
		}
		if (text.includes("spot")) {
			out.push(`<circle cx="22" cy="40" r="2.5" fill="#2a2017" opacity="0.5"/>`);
			out.push(`<circle cx="42" cy="42" r="2" fill="#2a2017" opacity="0.5"/>`);
		}
	}
	return out.join("\n");
}

// ---------- Per-state features ----------

function eyes(state: SpriteState, p: RenderParts): string {
	switch (state) {
		case "happy":
			return `
				<path d="M 22 30 q 2 -4 4 0" stroke="${p.feat}" stroke-width="2" fill="none" stroke-linecap="round"/>
				<path d="M 38 30 q 2 -4 4 0" stroke="${p.feat}" stroke-width="2" fill="none" stroke-linecap="round"/>
			`;
		case "hungry":
			return `
				<circle cx="24" cy="30" r="3.5" fill="${p.feat}"/>
				<circle cx="40" cy="30" r="3.5" fill="${p.feat}"/>
				<circle cx="25" cy="29" r="1.2" fill="#fff"/>
				<circle cx="41" cy="29" r="1.2" fill="#fff"/>
			`;
		case "pill-time":
			return `
				<rect x="20" y="25" width="7" height="1.5" rx="0.5" fill="${p.feat}" transform="rotate(-12 23.5 25.75)"/>
				<rect x="37" y="25" width="7" height="1.5" rx="0.5" fill="${p.feat}" transform="rotate(12 40.5 25.75)"/>
				<rect x="22" y="30" width="4" height="5" rx="1" fill="${p.feat}"/>
				<rect x="38" y="30" width="4" height="5" rx="1" fill="${p.feat}"/>
			`;
		case "sad":
			return `
				<path d="M 22 28 q 2 4 4 0" stroke="${p.feat}" stroke-width="2" fill="none" stroke-linecap="round"/>
				<path d="M 38 28 q 2 4 4 0" stroke="${p.feat}" stroke-width="2" fill="none" stroke-linecap="round"/>
				<ellipse cx="24" cy="36" rx="1.5" ry="2.5" fill="#7eb9d8" opacity="0.85"/>
			`;
		case "sleeping":
			return `
				<rect x="20" y="30" width="8" height="2" rx="1" fill="${p.feat}"/>
				<rect x="36" y="30" width="8" height="2" rx="1" fill="${p.feat}"/>
			`;
		default:
			return `
				<circle cx="24" cy="30" r="2.5" fill="${p.feat}"/>
				<circle cx="40" cy="30" r="2.5" fill="${p.feat}"/>
				<circle cx="24.7" cy="29.3" r="0.8" fill="#fff"/>
				<circle cx="40.7" cy="29.3" r="0.8" fill="#fff"/>
			`;
	}
}

function mouth(state: SpriteState, p: RenderParts): string {
	switch (state) {
		case "happy":
			return `<path d="M 26 38 q 6 6 12 0" stroke="${p.feat}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
		case "hungry":
			return `
				<ellipse cx="32" cy="41" rx="4" ry="3" fill="${p.feat}"/>
				<ellipse cx="32" cy="43" rx="2.5" ry="1.5" fill="${p.tongue}"/>
			`;
		case "pill-time":
			return `<rect x="29" y="42" width="6" height="2" rx="1" fill="${p.feat}"/>`;
		case "sad":
			return `<path d="M 26 44 q 6 -5 12 0" stroke="${p.feat}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
		case "sleeping":
			return `<path d="M 29 42 q 3 2 6 0" stroke="${p.feat}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
		default:
			return `<rect x="30" y="40" width="4" height="2" rx="1" fill="${p.feat}"/>`;
	}
}

function cheeks(state: SpriteState, p: RenderParts): string {
	if (state === "sad") return "";
	const r = state === "happy" ? 3 : 2.5;
	return `
		<circle cx="22" cy="40" r="${r}" fill="${p.blush}" opacity="0.55"/>
		<circle cx="42" cy="40" r="${r}" fill="${p.blush}" opacity="0.55"/>
	`;
}

function extras(state: SpriteState, _p: RenderParts): string {
	if (state === "sleeping") {
		return `
			<text x="50" y="20" font-family="ui-monospace,monospace" font-weight="700" font-size="8" fill="#6b8cc8">z</text>
			<text x="54" y="14" font-family="ui-monospace,monospace" font-weight="700" font-size="6" fill="#6b8cc8">z</text>
		`;
	}
	if (state === "pill-time") {
		return `
			<rect x="50" y="34" width="6" height="3" rx="1.5" fill="#f5c2c7"/>
			<rect x="53" y="34" width="3" height="3" rx="1.5" fill="#a1d2ce"/>
		`;
	}
	if (state === "hungry") {
		return `<path d="M 42 41 q 1 2 -1 3 q -1 -1 1 -3 z" fill="${_p.tongue}" opacity="0.7"/>`;
	}
	return "";
}

// ---------- Top-level render ----------

export function renderSpriteSvg(
	character: CharacterSheet,
	state: SpriteState,
): string {
	const p = partsFor(character);
	const droop = state === "sad" ? 4 : state === "sleeping" ? 2 : 0;

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" preserveAspectRatio="xMidYMid meet">
${ears(character, p, droop)}
${head(character, p)}
${markings(character, p)}
${eyes(state, p)}
${cheeks(state, p)}
${mouth(state, p)}
${extras(state, p)}
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
