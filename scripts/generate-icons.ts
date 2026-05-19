// Generate PWA icon PNGs from the source SVG.
//
//   bun run scripts/generate-icons.ts
//
// Writes:
//   public/icons/icon-192.png            (PWA manifest icon)
//   public/icons/icon-512.png            (PWA manifest icon, large)
//   public/icons/icon-512-maskable.png   (PWA maskable — full bleed bg)
//   public/icons/apple-touch-icon-180.png (iOS home-screen icon)
//
// Uses `sharp` (already in node_modules as a transitive dep). Re-run after
// editing public/icons/icon.svg.

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcSvg = await readFile(join(root, "public/icons/icon.svg"));

const outDir = join(root, "public/icons");
await mkdir(outDir, { recursive: true });

interface Variant {
	name: string;
	size: number;
	// For "maskable", pad nothing — the full square is safe area-aware via
	// the SVG's solid background. iOS apple-touch needs a rounded-square
	// flatten, but Safari already applies a rounded mask, so we keep the bg
	// fully painted.
	background?: string;
}

const variants: Variant[] = [
	{ name: "icon-192.png", size: 192 },
	{ name: "icon-512.png", size: 512 },
	{ name: "icon-512-maskable.png", size: 512 },
	{ name: "apple-touch-icon-180.png", size: 180 },
];

for (const v of variants) {
	const out = join(outDir, v.name);
	await sharp(srcSvg, { density: 384 })
		.resize(v.size, v.size, { fit: "contain", background: "#0f1417" })
		.png()
		.toFile(out);
	console.log(`✓ ${v.name}`);
}

console.log("Done.");
