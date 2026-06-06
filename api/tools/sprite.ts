import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { extractCharacterSheet } from "../ai/extract-character.ts";
import { renderSpritePack } from "../ai/render-sprite-svg.ts";
import type { Env } from "../env.ts";
import { PET_SELF_ID } from "../storage/pet-self.ts";
import { setSvgPack } from "../storage/pets.ts";

const SvgPackSchema = z.object({
	idle: z.string(),
	happy: z.string(),
	hungry: z.string(),
	"pill-time": z.string(),
	sleeping: z.string(),
});

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
