import { FileText, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { formatDateTime } from "@/lib/format.ts";
import { Layout } from "../components/Layout.tsx";
import { Section } from "../components/Section.tsx";
import { useAssets, useUploadAsset } from "../lib/queries.ts";

// The Assets app: the library of raw uploaded files. Drop anything — a lab PDF,
// a vaccine card, a photo — and the agent classifies it and files it into the
// timeline. Recording chunks are filtered out server-side (asset_list), so this
// shows only the documents you actually dropped, not pipeline internals.
export function AssetsPage() {
	const { data: assets } = useAssets();
	const upload = useUploadAsset();
	const inputRef = useRef<HTMLInputElement>(null);

	const handleFile = async (file: File) => {
		try {
			const buf = await file.arrayBuffer();
			const bytes = new Uint8Array(buf);
			let binary = "";
			const chunk = 0x8000;
			for (let i = 0; i < bytes.length; i += chunk) {
				binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
			}
			const result = await upload.mutateAsync({
				imageBase64: btoa(binary),
				mimeType: file.type || "application/octet-stream",
				originalName: file.name,
			});
			toast.success(`Filed as ${result.assetType.replace("_", " ")}`);
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const list = assets ?? [];

	return (
		<Layout>
			<div className="max-w-3xl mx-auto p-4 sm:p-6">
				<Section
					title="Assets"
					eyebrow={`${list.length} files`}
					action={
						<>
							<input
								ref={inputRef}
								type="file"
								accept="image/*,application/pdf"
								className="sr-only"
								disabled={upload.isPending}
								onChange={(e) => {
									const f = e.target.files?.[0];
									if (f) handleFile(f);
									e.target.value = "";
								}}
							/>
							<Button
								size="sm"
								disabled={upload.isPending}
								onClick={() => inputRef.current?.click()}
							>
								<Upload className="w-3.5 h-3.5" />
								{upload.isPending ? "Filing…" : "Upload"}
							</Button>
						</>
					}
				>
					<p className="text-xs text-muted-foreground mb-3">
						Drop any document, lab report, vaccine card, or photo — the agent
						files it into the timeline automatically.
					</p>
					{list.length === 0 ? (
						<p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground bg-secondary/40">
							Nothing uploaded yet.
						</p>
					) : (
						<div className="space-y-2">
							{list.map((a) => (
								<a
									key={a.id}
									href={`/api/files/${a.id}`}
									target="_blank"
									rel="noreferrer"
									className="flex items-center gap-3 rounded-xl bg-card surface p-3 hover:border-primary/30 transition-colors"
								>
									<FileText className="w-4 h-4 text-muted-foreground shrink-0" />
									<span className="flex-1 min-w-0 truncate text-sm">
										{a.originalName ?? a.id}
									</span>
									<span className="text-[10px] text-muted-foreground">
										{formatDateTime(a.uploadedAt)}
									</span>
								</a>
							))}
						</div>
					)}
				</Section>
			</div>
		</Layout>
	);
}
