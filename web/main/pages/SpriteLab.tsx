import { useMutation } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useMcpApp } from "@/context.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { SpritePackFull } from "@/types/api.ts";
import { Layout } from "../components/Layout.tsx";
import { Section } from "../components/Section.tsx";
import { callTool } from "../lib/mcp.ts";

const STATES: (keyof SpritePackFull)[] = [
	"idle",
	"happy",
	"hungry",
	"pill-time",
	"sad",
	"sleeping",
];

interface CompareResult {
	svgPack: SpritePackFull;
	rasterPack: SpritePackFull | null;
	rasterError: string | null;
}

export function SpriteLabPage() {
	const app = useMcpApp();
	const inputRef = useRef<HTMLInputElement>(null);
	const [includeRaster, setIncludeRaster] = useState(true);

	const compare = useMutation({
		mutationFn: async (file: File) => {
			const buf = await file.arrayBuffer();
			const bytes = new Uint8Array(buf);
			let binary = "";
			const chunk = 0x8000;
			for (let i = 0; i < bytes.length; i += chunk) {
				binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
			}
			return callTool<CompareResult>(app, "sprite_compare", {
				imageBase64: btoa(binary),
				mimeType: file.type || "image/jpeg",
				includeRaster,
			});
		},
		onError: (e) => toast.error((e as Error).message),
	});

	const result = compare.data;

	return (
		<Layout breadcrumb={<span>sprite lab</span>}>
			<div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
				<Section
					title="Sprite lab"
					eyebrow="Compare both methods"
					action={
						<>
							<input
								ref={inputRef}
								type="file"
								accept="image/*"
								className="sr-only"
								disabled={compare.isPending}
								onChange={(e) => {
									const f = e.target.files?.[0];
									if (f) compare.mutate(f);
									e.target.value = "";
								}}
							/>
							<Button
								size="sm"
								disabled={compare.isPending}
								onClick={() => inputRef.current?.click()}
							>
								<Upload className="w-3.5 h-3.5" />
								{compare.isPending ? "Generating…" : "Upload a photo"}
							</Button>
						</>
					}
				>
					<p className="text-sm text-muted-foreground mb-3">
						Upload a pet photo. Both pipelines run from the same AI character
						sheet: <strong>SVG</strong> (procedural, instant, free, crisp at any
						size) and <strong>Raster</strong> (Workers AI img2img — needs
						Cloudflare auth, slower, photo-grounded).
					</p>
					<label className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
						<input
							type="checkbox"
							checked={includeRaster}
							onChange={(e) => setIncludeRaster(e.target.checked)}
						/>
						Also run the raster pass (slower, needs Workers AI)
					</label>

					{compare.isPending ? (
						<p className="text-sm text-muted-foreground">
							Reading the photo, building a character sheet, rendering 6 states
							each…
						</p>
					) : null}

					{result ? (
						<div className="space-y-8">
							<MethodRow
								title="SVG (procedural)"
								pack={result.svgPack}
								isSvg
							/>
							{result.rasterPack ? (
								<MethodRow
									title="Raster (img2img)"
									pack={result.rasterPack}
									isSvg={false}
								/>
							) : (
								<div className="text-sm text-muted-foreground">
									Raster pass skipped or failed
									{result.rasterError ? `: ${result.rasterError}` : "."}
								</div>
							)}
						</div>
					) : null}
				</Section>
			</div>
		</Layout>
	);
}

function MethodRow({
	title,
	pack,
	isSvg,
}: {
	title: string;
	pack: SpritePackFull;
	isSvg: boolean;
}) {
	return (
		<div>
			<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-2">
				{title}
			</div>
			<div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
				{STATES.map((s) => (
					<div key={s} className="text-center">
						<div className="rounded-xl bg-card surface aspect-square flex items-center justify-center overflow-hidden p-1">
							{isSvg ? (
								// SVG string → inline
								// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted, our own renderer
								<div
									className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
									style={{ imageRendering: "auto" }}
									dangerouslySetInnerHTML={{ __html: pack[s] }}
								/>
							) : (
								<img
									src={pack[s]}
									alt={s}
									className="w-full h-full object-contain"
									style={{ imageRendering: "pixelated" }}
								/>
							)}
						</div>
						<div className="text-[10px] text-muted-foreground mt-1">{s}</div>
					</div>
				))}
			</div>
		</div>
	);
}
