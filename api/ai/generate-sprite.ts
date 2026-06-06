import type { Env } from "../env.ts";
import {
	type CharacterSheet,
	characterPromptFragment,
} from "./extract-character.ts";
import { workersAiRunBytes } from "./gateway.ts";

// Pass 1b + Pass 2 of the sprite pipeline: Workers AI img2img runs.
//
// We use `@cf/runwayml/stable-diffusion-v1-5-img2img` because it's the
// only Workers AI image model that takes a conditioning image — critical
// for identity consistency across the 6 expression variants.
//
// Quality calibration is a TODO: prompts here are a starting point, not
// the final state. Tune `strength`, `guidance`, and the prompt prefix
// based on actual output. The README's "Companion calibration" section
// tracks the iteration.

const MODEL = "@cf/runwayml/stable-diffusion-v1-5-img2img";

const STYLE_PREFIX =
	"pixel art kawaii virtual-pet creature face, front-facing, 64x64 native resolution, soft pastel palette, transparent background, clean outlines, cute style";
const NEGATIVE =
	"realistic photo, 3d render, blurry, low detail, multiple characters, text, watermark, anti-aliased, smooth gradients, dark moody";

// Per-state expression deltas. Pass 2 appends one of these to the base
// prompt so the character holds steady but the face changes.
export const EXPRESSION_PROMPTS: Record<string, string> = {
	idle:
		"neutral expression, eyes open and round, mouth closed in a small smile, ears relaxed",
	happy:
		"happy expression, eyes squinted into smile-arcs, mouth open in a big grin, ears perked up high",
	hungry:
		"hungry expression, eyes wide and pleading, mouth open showing tongue, small water-drop near mouth",
	"pill-time":
		"slightly stoic expression, concerned eyebrows raised, mouth pursed in a small flat line, ears slightly forward",
	sad: "sad expression, droopy half-closed eyes, downturned frown mouth, ears flat against the head",
	sleeping:
		"sleeping expression, eyes closed shown as two short horizontal lines, peaceful tiny smile, small floating z particle above head",
};

export interface BasePassInput {
	photoBase64: string;
	character: CharacterSheet;
}

export interface VariantPassInput {
	baseSpriteBytes: Uint8Array;
	character: CharacterSheet;
	state: keyof typeof EXPRESSION_PROMPTS;
}

// Workers AI img2img returns a ReadableStream of PNG bytes. Drain it
// into a single Uint8Array so we can post it to R2 in one call.
async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			chunks.push(value);
			total += value.byteLength;
		}
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.byteLength;
	}
	return out;
}

// Run the img2img model, preferring the in-Worker AI binding (fast, no extra
// auth) and falling back to the AI Gateway REST route when the binding can't
// run (local `wrangler dev` without --remote throws "run remotely"). Both
// paths return the PNG bytes.
// biome-ignore lint/suspicious/noExplicitAny: model input is heterogeneous
async function runImg2Img(env: Env, body: any): Promise<Uint8Array> {
	try {
		const result = (await env.AI.run(MODEL, body)) as ReadableStream<Uint8Array>;
		return await streamToBytes(result);
	} catch (err) {
		const msg = (err as Error).message ?? "";
		// The binding throws this in local dev; anything else is a real error.
		if (!/run remotely|not supported|binding/i.test(msg)) throw err;
		return workersAiRunBytes(env, MODEL, body);
	}
}

function base64ToBytes(b64: string): Uint8Array {
	const clean = b64.replace(/^data:[^,]+,/, "");
	const binary = atob(clean);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

// Pass 1b: turn the photo into the base creature sprite.
export async function generateBaseSprite(
	env: Env,
	input: BasePassInput,
): Promise<Uint8Array> {
	const prompt = [
		STYLE_PREFIX,
		characterPromptFragment(input.character),
		"single character, eyes open, neutral expression, soft chroma-key-friendly background",
	].join(", ");

	const photoBytes = base64ToBytes(input.photoBase64);
	return runImg2Img(env, {
		prompt,
		negative_prompt: NEGATIVE,
		image: Array.from(photoBytes),
		// Lean hard on the prompt — we want stylized pixel-art, not a
		// photo-realistic remix of the input.
		strength: 0.85,
		guidance: 8,
		// Workers AI caps img2img at 20 steps (the REST API rejects >20).
		num_steps: 20,
	});
}

// Pass 2: derive expression variants from the base sprite.
export async function generateVariantSprite(
	env: Env,
	input: VariantPassInput,
): Promise<Uint8Array> {
	const expression = EXPRESSION_PROMPTS[input.state];
	if (!expression) throw new Error(`Unknown expression state: ${input.state}`);

	const prompt = [
		STYLE_PREFIX,
		"same character as the reference image",
		characterPromptFragment(input.character),
		expression,
	].join(", ");

	return runImg2Img(env, {
		prompt,
		negative_prompt: NEGATIVE,
		image: Array.from(input.baseSpriteBytes),
		// Lighter touch on variants — we want the expression to change but
		// the identity (colors, ears, head shape) to stay locked.
		strength: 0.55,
		guidance: 7,
		num_steps: 20,
	});
}

export const SPRITE_STATES = [
	"idle",
	"happy",
	"hungry",
	"pill-time",
	"sad",
	"sleeping",
] as const;
export type SpriteState = (typeof SPRITE_STATES)[number];
