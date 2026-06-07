#!/usr/bin/env bun
// Generate the social/OG share image (1200×630) for the landing — the card
// you see unfurled in WhatsApp/iMessage/Twitter. Renders "Tama.vet" + a
// one-line product pitch + Beto's happy face, in the landing's brutalist style,
// in both EN and PT, and rasterizes each to a PNG with qlmanage (the only SVG
// rasterizer on the box). Output → landing/public/og-en.png, og-pt.png.
//
//   bun run scripts/gen-og.ts
//
// Local-only authoring utility — not shipped behavior.

import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const DB =
	".wrangler/state/v3/d1/miniflare-D1DatabaseObject/230b8d988213fd57a31272c05cc0f03407b19a972cf5012cbbf2661691000e07.sqlite";

// Three concept colors lifted from the landing's highlight marks.
const MINT = "#b6e3c8";
const PEACH = "#ffbd8e";
const LAVENDER = "#c9b6f0";

interface Copy {
	tag: string;
	intro: string;
	features: readonly { t: string; c: string }[];
}

const COPY: Record<"en" | "pt", Copy> = {
	en: {
		tag: "FREE · OPEN · YOURS",
		intro: "Intelligence for your pet to live better.",
		features: [
			{ t: "One life timeline.", c: MINT },
			{ t: "A medicine timetable.", c: PEACH },
			{ t: "An AI a vet can talk to.", c: LAVENDER },
		],
	},
	pt: {
		tag: "GRÁTIS · ABERTO · SEU",
		intro: "Inteligência pro seu pet viver melhor.",
		features: [
			{ t: "Uma linha do tempo.", c: MINT },
			{ t: "Uma tabela de remédios.", c: PEACH },
			{ t: "Uma IA pro vet conversar.", c: LAVENDER },
		],
	},
};

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function card(happyB64: string, copy: Copy): string {
	const W = 1200;
	const H = 630;
	const FONT = "'Helvetica Neue', 'Arial Black', Helvetica, Arial, sans-serif";

	// Each feature line gets a landing-style highlight mark in its concept color.
	const features = copy.features
		.map((f, i) => {
			const y = 372 + i * 62;
			const w = f.t.length * 16.5 + 24;
			return `<rect x="74" y="${y - 37}" width="${w}" height="48" fill="${f.c}"/>
    <text x="88" y="${y}" font-family="${FONT}" font-size="34" font-weight="700" fill="#2a1f17">${esc(f.t)}</text>`;
		})
		.join("\n    ");

	const pillW = 42 + copy.tag.length * 13.5;

	// qlmanage squares the thumbnail and top-aligns the art, so we author a
	// 1200×1200 canvas with the 1200×630 card centered (translated by (1200-630)/2
	// = 285). A center-crop to 1200×630 then lands exactly on the card.
	const PAD = (1200 - H) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect x="0" y="0" width="1200" height="1200" fill="#fff8ee"/>
  <g transform="translate(0 ${PAD})">
    <!-- paper + brut frame -->
    <rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="#fff8ee" stroke="#2a1f17" stroke-width="8"/>
    <!-- tagline pill -->
    <rect x="80" y="64" width="${pillW}" height="40" fill="none" stroke="#2a1f17" stroke-width="2"/>
    <text x="100" y="91" font-family="${FONT}" font-size="19" font-weight="700" letter-spacing="3" fill="#2a1f17">${esc(copy.tag)}</text>
    <!-- peach highlight behind the wordmark -->
    <rect x="74" y="146" width="430" height="80" fill="${PEACH}"/>
    <text x="80" y="211" font-family="${FONT}" font-size="100" font-weight="800" fill="#2a1f17" letter-spacing="-2">Tama.vet</text>
    <!-- intro line + three color-highlighted feature marks -->
    <text x="80" y="300" font-family="${FONT}" font-size="30" font-weight="600" fill="#3a2c1e">${esc(copy.intro)}</text>
    ${features}
    <!-- Beto, happy — large disc filling the right side -->
    <circle cx="908" cy="315" r="232" fill="#efe6d3" stroke="#2a1f17" stroke-width="8"/>
    <image x="699" y="106" width="418" height="418" href="data:image/svg+xml;base64,${happyB64}"/>
  </g>
</svg>`;
}

async function main() {
	const happySvg = (
		await $`sqlite3 ${DB} ${"SELECT json_extract(svg_pack_json,'$.happy') FROM pets WHERE id='pet_self';"}`.text()
	).trim();
	if (!happySvg.startsWith("<svg")) {
		throw new Error("Could not read Beto's happy sprite from local D1");
	}
	const happyB64 = Buffer.from(happySvg, "utf8").toString("base64");

	const tmp = await mkdtemp(join(tmpdir(), "tama-og-"));
	try {
		for (const lang of ["en", "pt"] as const) {
			const svg = card(happyB64, COPY[lang]);
			const svgPath = join(tmp, `og-${lang}.svg`);
			await writeFile(svgPath, svg, "utf8");
			// qlmanage → PNG at 1200px wide (height follows the 1200×630 viewBox).
			await $`qlmanage -t -s 1200 -o ${tmp} ${svgPath}`.quiet();
			const out = `landing/public/og-${lang}.png`;
			await rename(join(tmp, `og-${lang}.svg.png`), out);
			// qlmanage emits a 1200×1200 square (card centered vertically) — crop
			// to the 1200×630 OG band.
			await $`sips -c 630 1200 ${out}`.quiet();
			const bytes = await readFile(out);
			console.log(`✓ ${out} (${Math.round(bytes.length / 1024)} KB)`);
		}
	} finally {
		await rm(tmp, { recursive: true, force: true });
	}
}

await main();
