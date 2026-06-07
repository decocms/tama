import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { CharacterSheet } from "../ai/extract-character.ts";
import { extractCharacterSheet } from "../ai/extract-character.ts";
import {
	renderSpritePack,
	renderSpriteSvg,
	STATES,
} from "../ai/render-sprite-svg.ts";
import type { Env } from "../env.ts";
import { getSelfPet, PET_SELF_ID } from "../storage/pet-self.ts";
import { parseSvgPack, setSvgPack } from "../storage/pets.ts";

const SvgPackSchema = z.object({
	idle: z.string(),
	happy: z.string(),
	hungry: z.string(),
	"pill-time": z.string(),
	sleeping: z.string(),
	// Added after the original 5; old packs may lack it (fill via
	// pet_sprite_fill_missing rather than re-rendering the whole pack).
	sad: z.string().optional(),
});

// The traits the renderer reads. Exposed as the editable knobs for iteration.
const CharacterSheetSchema = z.object({
	species: z.string(),
	breed: z.string().nullable().optional(),
	primaryColor: z.string(),
	secondaryColor: z.string().nullable().optional(),
	earShape: z.enum(["floppy", "pointy", "folded", "round", "tufted", "unknown"]),
	markings: z.array(z.string()),
	headShape: z.string().nullable().optional(),
	eyeColor: z.string().nullable().optional(),
	distinctiveFeatures: z.array(z.string()),
});

const DEFAULT_CHARACTER: CharacterSheet = {
	species: "dog",
	breed: null,
	primaryColor: "tan",
	secondaryColor: null,
	earShape: "unknown",
	markings: [],
	headShape: null,
	eyeColor: null,
	distinctiveFeatures: [],
};

function currentCharacter(json: string | null | undefined): CharacterSheet {
	if (!json) return { ...DEFAULT_CHARACTER };
	try {
		return { ...DEFAULT_CHARACTER, ...(JSON.parse(json) as CharacterSheet) };
	} catch {
		return { ...DEFAULT_CHARACTER };
	}
}

// The sprite pipeline, procedural-SVG only:
//
//   Photo ─► Claude vision ─► character sheet (colors, ears, markings, head)
//         └─► deterministic SVG renderer ─► 6 states {idle, happy, hungry,
//             pill-time, sad, sleeping}
//
// One vision call, then instant/free/offline rendering — crisp at any size.
// (The old Workers-AI img2img raster path was removed: it burned the metered
// neuron budget without a quality win for this kawaii-companion style.)
export const petSpriteSvgGenerateTool = (_env: Env) =>
	createTool({
		id: "pet_sprite_svg_generate",
		description: `Generate the pet's 6-state companion sprite pack from a photo. Runs one Claude vision pass to read the photo into a character sheet (coat colors, ear shape, markings, head shape), then renders all 6 emotion states as procedural SVG — instant, free, and crisp at any size. Stores the pack on the pet; the companion view uses it. This is what the setup flow calls after collecting the pet's photo; re-invoke anytime to refine (e.g. a new photo).`,
		inputSchema: z.object({
			imageBase64: z.string().describe("Base64 PNG/JPEG/WebP of the pet."),
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

// Read the stored character sheet + current sprite pack — so an iteration loop
// (in Studio chat or the UI) can see what's there before tweaking it.
export const petSpriteGetTool = (_env: Env) =>
	createTool({
		id: "pet_sprite_get",
		description:
			"Get the pet's current sprite character sheet (the editable traits — colors, ear shape, markings, head shape) and the rendered 6-state SVG pack. Use before pet_sprite_adjust to see what to change.",
		inputSchema: z.object({}),
		outputSchema: z.object({
			characterSheet: CharacterSheetSchema.nullable(),
			svgPack: SvgPackSchema.nullable(),
		}),
		annotations: { readOnlyHint: true },
		execute: async ({ runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const pet = await getSelfPet(env);
			const characterSheet = pet?.characterJson
				? (currentCharacter(pet.characterJson) as z.infer<typeof CharacterSheetSchema>)
				: null;
			let svgPack: z.infer<typeof SvgPackSchema> | null = null;
			if (pet?.svgPackJson) {
				try {
					svgPack = JSON.parse(pet.svgPackJson);
				} catch {
					svgPack = null;
				}
			}
			return { characterSheet, svgPack };
		},
	});

// Iterate the sprite WITHOUT re-uploading the photo: merge trait overrides into
// the stored character sheet and re-render. This is the "send a photo (saves
// v1) → tweak → tweak until happy" loop. Every field is optional; only the ones
// you pass change. Arrays (markings, distinctiveFeatures) replace wholesale.
export const petSpriteAdjustTool = (_env: Env) =>
	createTool({
		id: "pet_sprite_adjust",
		description: `Adjust the pet's sprite by tweaking individual traits and re-rendering — no photo needed. Merges your overrides onto the stored character sheet (from the last photo) and saves the new pack. Use this to iterate: "floppier ears" → {earShape:"floppy"}, "more ginger" → {primaryColor:"ginger"}, "add a white blaze" → {markings:[...,"white blaze on muzzle"]}. Call pet_sprite_get first to see current values. earShape ∈ floppy|pointy|folded|round|tufted|unknown; longCoat fluff is inferred from breed/markings/features (e.g. include "long coat").`,
		inputSchema: z.object({
			species: z.string().optional(),
			breed: z.string().nullable().optional(),
			primaryColor: z.string().optional().describe('e.g. "cream", "black and white", "ginger"'),
			secondaryColor: z.string().nullable().optional().describe("the patch/cap color for particolor pets"),
			earShape: z
				.enum(["floppy", "pointy", "folded", "round", "tufted", "unknown"])
				.optional(),
			markings: z
				.array(z.string())
				.optional()
				.describe('replaces the list, e.g. ["black cap over head and ears","white blaze on muzzle"]'),
			headShape: z.string().nullable().optional().describe('"round apple head", "long and narrow", "boxy"'),
			eyeColor: z.string().nullable().optional(),
			distinctiveFeatures: z
				.array(z.string())
				.optional()
				.describe('replaces the list, e.g. ["oversized ears","long coat fringe"]'),
		}),
		outputSchema: z.object({
			characterSheet: CharacterSheetSchema,
			svgPack: SvgPackSchema,
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const pet = await getSelfPet(env);
			const base = currentCharacter(pet?.characterJson);
			// Apply only the keys actually provided (skip undefined).
			const merged: CharacterSheet = { ...base };
			for (const [k, v] of Object.entries(context)) {
				if (v !== undefined) {
					(merged as Record<string, unknown>)[k] = v;
				}
			}
			const pack = renderSpritePack(merged);
			await setSvgPack(env, PET_SELF_ID, pack, JSON.stringify(merged));
			return {
				characterSheet: merged as z.infer<typeof CharacterSheetSchema>,
				svgPack: pack,
			};
		},
	});

// Add ONLY the sprite states missing from the current pack (e.g. a newly-added
// "sad" frame), rendering each from the stored character sheet and merging into
// the existing pack. The frames already there are kept byte-for-byte — so a pack
// the owner is happy with is never re-rendered (the renderer evolves over time;
// a full re-render would subtly change every face). No-op if nothing's missing.
export const petSpriteFillMissingTool = (_env: Env) =>
	createTool({
		id: "pet_sprite_fill_missing",
		description:
			"Fill in any companion sprite states that the current pack is missing (e.g. a 'sad' frame added after the pack was first generated). Renders ONLY the absent states from the stored character sheet and merges them — existing frames are left exactly as they are, so a pack you like is never re-rendered. No photo, no AI. No-op if the pack is already complete.",
		inputSchema: z.object({}),
		outputSchema: z.object({
			added: z.array(z.string()),
			svgPack: z.record(z.string(), z.string()).nullable(),
		}),
		execute: async ({ runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const pet = await getSelfPet(env);
			const existing = pet ? (parseSvgPack(pet) ?? {}) : {};
			if (!pet?.characterJson || Object.keys(existing).length === 0) {
				// Nothing to merge into / no character sheet to render from.
				return { added: [], svgPack: pet ? parseSvgPack(pet) : null };
			}
			const character = currentCharacter(pet.characterJson);
			const merged: Record<string, string> = { ...existing };
			const added: string[] = [];
			for (const s of STATES) {
				if (!merged[s]) {
					merged[s] = renderSpriteSvg(character, s);
					added.push(s);
				}
			}
			if (added.length === 0) return { added: [], svgPack: existing };
			await setSvgPack(env, PET_SELF_ID, merged, pet.characterJson);
			return { added, svgPack: merged };
		},
	});
