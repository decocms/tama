import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { extractCharacterSheet } from "../ai/extract-character.ts";
import {
	generateBaseSprite,
	generateVariantSprite,
	SPRITE_STATES,
	type SpriteState,
} from "../ai/generate-sprite.ts";
import { renderSpritePack } from "../ai/render-sprite-svg.ts";
import type { Env } from "../env.ts";
import { saveFile, saveFileFromBytes } from "../storage/files.ts";
import { PET_SELF_ID } from "../storage/pet-self.ts";
import { setSpritePack, setSvgPack, type SpritePack } from "../storage/pets.ts";

const SvgPackSchema = z.object({
	idle: z.string(),
	happy: z.string(),
	hungry: z.string(),
	"pill-time": z.string(),
	sad: z.string(),
	sleeping: z.string(),
});

// pet_sprite_generate: the two-pass identity-consistent sprite pipeline.
//
//   Photo
//     │
//     ├─► Claude vision → character sheet JSON (colors, ears, markings…)
//     │
//     ├─► Workers AI img2img(photo, prompt with character traits)
//     │      → base sprite (idle)
//     │
//     └─► For each of {happy, hungry, pill-time, sad, sleeping}:
//            Workers AI img2img(base sprite, prompt with expression delta)
//              → variant sprite
//
// All 6 PNGs land in R2 under pet/<petId>/sprite-<state>-<fileId>.png and
// their public URLs (served by /api/files/:fileId) are stored on the
// pets row as a JSON map. The companion view prefers this pack and falls
// back to the static placeholder at /companion-sprite.svg until first run.
//
// Calibration notes:
//   - Quality varies. The prompts in api/ai/generate-sprite.ts are a
//     starting point; expect to iterate on strength/guidance/steps.
//   - Cost: 6 model calls plus 1 vision call. ~30-60s end-to-end on a
//     warm Workers AI region. Acceptable as a one-time adopt step.
//   - Identity drift: the base sprite is the anchor for variants. If
//     variants don't resemble the base, raise strength on the base pass
//     or lower it on the variants.

export const petSpriteGenerateTool = (_env: Env) =>
	createTool({
		id: "pet_sprite_generate",
		description: `Generate the pet's 6-state pixel sprite pack from a photo. Runs Claude vision (character extraction) → Workers AI img2img base pass → 5 expression variants. The result is the per-pet identity sprite the companion view uses for {idle, happy, hungry, pill-time, sad, sleeping}.

Idempotent unless regenerate=true; otherwise re-running with the same photo will overwrite the existing pack.

This is what the adopt skill calls after collecting the pet's photo. Can also be re-invoked later (e.g. the pet got a haircut, or the first render looked off).`,
		inputSchema: z.object({
			imageBase64: z.string().describe("Base64 PNG/JPEG/WebP of the pet."),
			mimeType: z.string().describe("image/jpeg, image/png, image/webp."),
			originalName: z.string().optional(),
			regenerate: z
				.boolean()
				.optional()
				.describe(
					"If true, force a fresh run even if a sprite pack already exists.",
				),
		}),
		outputSchema: z.object({
			spritePack: z.object({
				idle: z.string(),
				happy: z.string(),
				hungry: z.string(),
				"pill-time": z.string(),
				sad: z.string(),
				sleeping: z.string(),
			}),
			photoFileId: z.string(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;

			// 1. Persist the source photo so we can rerun without re-upload.
			const photo = await saveFile(env, {
				base64: context.imageBase64,
				mimeType: context.mimeType,
				originalName: context.originalName,
				kind: "other",
			});

			// 2. Vision pass: structured character sheet.
			const character = await extractCharacterSheet(env, {
				imageBase64: context.imageBase64,
				mimeType: context.mimeType,
			});

			// 3. Base sprite (idle).
			const baseBytes = await generateBaseSprite(env, {
				photoBase64: context.imageBase64,
				character,
			});
			const baseFile = await saveFileFromBytes(env, {
				bytes: baseBytes,
				mimeType: "image/png",
				originalName: "sprite-idle.png",
				kind: "other",
			});

			// 4. Five variants in parallel. Workers AI handles concurrency.
			const variantStates = SPRITE_STATES.filter(
				(s) => s !== "idle",
			) as SpriteState[];
			const variants = await Promise.all(
				variantStates.map(async (state) => {
					const bytes = await generateVariantSprite(env, {
						baseSpriteBytes: baseBytes,
						character,
						state,
					});
					const file = await saveFileFromBytes(env, {
						bytes,
						mimeType: "image/png",
						originalName: `sprite-${state}.png`,
						kind: "other",
					});
					return [state, file.id] as const;
				}),
			);

			const pack: SpritePack = {
				idle: `/api/files/${baseFile.id}`,
				happy: "",
				hungry: "",
				"pill-time": "",
				sad: "",
				sleeping: "",
				size: 64,
			};
			for (const [state, fileId] of variants) {
				pack[state] = `/api/files/${fileId}`;
			}

			await setSpritePack(
				env,
				PET_SELF_ID,
				pack,
				JSON.stringify(character),
				photo.id,
			);

			return {
				spritePack: {
					idle: pack.idle,
					happy: pack.happy,
					hungry: pack.hungry,
					"pill-time": pack["pill-time"],
					sad: pack.sad,
					sleeping: pack.sleeping,
				},
				photoFileId: photo.id,
			};
		},
	});

// The cheap/crisp alternative: procedural SVG sprites. One vision call for the
// character sheet, then deterministic SVG rendering for all 6 states. ~1s,
// free, scales to any size. The companion prefers this pack when present.
export const petSpriteSvgGenerateTool = (_env: Env) =>
	createTool({
		id: "pet_sprite_svg_generate",
		description: `Generate the pet's 6-state sprite pack as procedural SVG (vector) from a photo. Cheaper/faster/crisper than pet_sprite_generate (raster img2img): one Claude vision call for the character sheet, then instant deterministic SVG rendering. Stores into the pet's svg pack; the companion prefers SVG when available.`,
		inputSchema: z.object({
			imageBase64: z.string(),
			mimeType: z.string().describe("image/jpeg, image/png, image/webp."),
		}),
		outputSchema: z.object({ svgPack: SvgPackSchema }),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const character = await extractCharacterSheet(env, {
				imageBase64: context.imageBase64,
				mimeType: context.mimeType,
			});
			const pack = renderSpritePack(character);
			await setSvgPack(env, PET_SELF_ID, pack, JSON.stringify(character));
			return { svgPack: pack };
		},
	});

// Demo helper for the /sprite-lab comparison page: one character sheet, both
// methods returned together. Raster needs Workers AI (Cloudflare auth); SVG is
// always available.
export const spriteCompareTool = (_env: Env) =>
	createTool({
		id: "sprite_compare",
		description:
			"Generate BOTH sprite methods (raster img2img + procedural SVG) from one photo and return them side by side, for comparison. Used by the sprite-lab demo. Does not persist anything.",
		inputSchema: z.object({
			imageBase64: z.string(),
			mimeType: z.string(),
			includeRaster: z
				.boolean()
				.optional()
				.describe(
					"Default true. Set false to skip the slow/Workers-AI raster pass and only render SVG.",
				),
		}),
		outputSchema: z.object({
			svgPack: SvgPackSchema,
			rasterPack: SvgPackSchema.nullable(),
			rasterError: z.string().nullable(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const character = await extractCharacterSheet(env, {
				imageBase64: context.imageBase64,
				mimeType: context.mimeType,
			});
			const svgPack = renderSpritePack(character);

			let rasterPack: Record<SpriteState, string> | null = null;
			let rasterError: string | null = null;
			if (context.includeRaster !== false) {
				try {
					const baseBytes = await generateBaseSprite(env, {
						photoBase64: context.imageBase64,
						character,
					});
					const toDataUrl = (b: Uint8Array) => {
						let bin = "";
						for (let i = 0; i < b.length; i++)
							bin += String.fromCharCode(b[i]);
						return `data:image/png;base64,${btoa(bin)}`;
					};
					const variantStates = SPRITE_STATES.filter(
						(s) => s !== "idle",
					) as SpriteState[];
					const variants = await Promise.all(
						variantStates.map(async (state) => {
							const bytes = await generateVariantSprite(env, {
								baseSpriteBytes: baseBytes,
								character,
								state,
							});
							return [state, toDataUrl(bytes)] as const;
						}),
					);
					const rp = {
						idle: toDataUrl(baseBytes),
					} as Record<SpriteState, string>;
					for (const [state, url] of variants) rp[state] = url;
					rasterPack = rp;
				} catch (err) {
					rasterError = (err as Error).message;
				}
			}

			return {
				svgPack,
				rasterPack: rasterPack
					? {
							idle: rasterPack.idle,
							happy: rasterPack.happy,
							hungry: rasterPack.hungry,
							"pill-time": rasterPack["pill-time"],
							sad: rasterPack.sad,
							sleeping: rasterPack.sleeping,
						}
					: null,
				rasterError,
			};
		},
	});
