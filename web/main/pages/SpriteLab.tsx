import { useMutation } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { useMcpApp } from "@/context.tsx";
import type { SpritePackFull } from "@/types/api.ts";
import { Layout } from "../components/Layout.tsx";
import { Section } from "../components/Section.tsx";
import { callTool } from "../lib/mcp.ts";

const STATES: (keyof SpritePackFull)[] = [
	"idle",
	"happy",
	"hungry",
	"pill-time",
	"sleeping",
];

// The companion sprite is procedural SVG: one Claude vision call reads the
// photo into a character sheet (coat colors, ear shape, markings, head shape),
// then the renderer draws all 6 states deterministically — instant, free, and
// crisp at any size. (The old Workers-AI img2img raster path was dropped: it
// burned the metered neuron budget for no real quality win here.)
export function SpriteLabPage() {
	const app = useMcpApp();
	const inputRef = useRef<HTMLInputElement>(null);

	const generate = useMutation({
		mutationFn: async (file: File) => {
			const buf = await file.arrayBuffer();
			const bytes = new Uint8Array(buf);
			let binary = "";
			const chunk = 0x8000;
			for (let i = 0; i < bytes.length; i += chunk) {
				binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
			}
			return callTool<{ svgPack: SpritePackFull }>(
				app,
				"pet_sprite_svg_generate",
				{ imageBase64: btoa(binary), mimeType: file.type || "image/jpeg" },
			);
		},
		onError: (e) => toast.error((e as Error).message),
	});

	const pack = generate.data?.svgPack;

	return (
		<Layout breadcrumb={<span>sprite</span>}>
			<div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
				<Section
					title="Pixel companion"
					eyebrow="Generated from a photo"
					action={
						<>
							<input
								ref={inputRef}
								type="file"
								accept="image/*"
								className="sr-only"
								disabled={generate.isPending}
								onChange={(e) => {
									const f = e.target.files?.[0];
									if (f) generate.mutate(f);
									e.target.value = "";
								}}
							/>
							<Button
								size="sm"
								disabled={generate.isPending}
								onClick={() => inputRef.current?.click()}
							>
								<Upload className="w-3.5 h-3.5" />
								{generate.isPending ? "Generating…" : "Upload a photo"}
							</Button>
						</>
					}
				>
					<p className="text-sm text-muted-foreground mb-4">
						Upload a pet photo. An AI reads it into a character sheet — coat
						colors, ear shape, markings — then the six companion faces are drawn
						from it: instant, free, and crisp at any size. Re-upload anytime to
						refine.
					</p>

					{generate.isPending ? (
						<p className="text-sm text-muted-foreground">
							Reading the photo, building a character sheet, drawing 6 states…
						</p>
					) : null}

					{pack ? (
						<div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
							{STATES.map((s) => (
								<div key={s} className="text-center">
									{/* Warm-gray tile so the white fur ruff reads against it. */}
									<div className="rounded-xl bg-[#cdc6ba] aspect-square flex items-center justify-center overflow-hidden p-1 shadow-inner">
										{/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own renderer */}
										<div
											className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
											dangerouslySetInnerHTML={{ __html: pack[s] }}
										/>
									</div>
									<div className="text-[10px] text-muted-foreground mt-1">{s}</div>
								</div>
							))}
						</div>
					) : null}
				</Section>
			</div>
		</Layout>
	);
}
