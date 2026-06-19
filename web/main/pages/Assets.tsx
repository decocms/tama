import { Download, ExternalLink, FileText, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Input } from "@/components/ui/input.tsx";
import { formatDateTime } from "@/lib/format.ts";
import type { Asset } from "@/types/api.ts";
import { Layout } from "../components/Layout.tsx";
import { Section } from "../components/Section.tsx";
import { useAssets, useUploadAsset } from "../lib/queries.ts";

const KIND_LABEL: Record<string, string> = {
	exam: "Exams",
	prescription: "Prescriptions",
	other: "Other",
};

// The Assets app: the library of uploaded files (stored durably in R2). Filter
// by kind / name, select some or all, and download the selection as a zip.
// Dropping a file still routes it into the timeline via the AI classifier.
export function AssetsPage() {
	const { data: assets } = useAssets();
	const upload = useUploadAsset();
	const inputRef = useRef<HTMLInputElement>(null);
	const [kind, setKind] = useState<string>("all");
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const list = assets ?? [];

	// Kinds actually present → filter chips (always include "all").
	const kinds = useMemo(() => {
		const s = new Set<string>();
		for (const a of list) s.add(a.kind);
		return ["all", ...Array.from(s).sort()];
	}, [list]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return list.filter(
			(a) =>
				(kind === "all" || a.kind === kind) &&
				(q === "" || (a.originalName ?? a.id).toLowerCase().includes(q)),
		);
	}, [list, kind, query]);

	const allFilteredSelected =
		filtered.length > 0 && filtered.every((a) => selected.has(a.id));

	const toggle = (id: string) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	const toggleAll = () =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (allFilteredSelected) {
				for (const a of filtered) next.delete(a.id);
			} else {
				for (const a of filtered) next.add(a.id);
			}
			return next;
		});

	const downloadZip = () => {
		const ids = Array.from(selected);
		if (ids.length === 0) return;
		// Same-origin relative link to the worker (works embedded + standalone);
		// the route replies with content-disposition so the browser downloads it.
		const url = `/api/files/zip?ids=${ids.map(encodeURIComponent).join(",")}`;
		const a = document.createElement("a");
		a.href = url;
		a.rel = "noreferrer";
		a.target = "_blank";
		document.body.appendChild(a);
		a.click();
		a.remove();
	};

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

	const selCount = selected.size;

	return (
		<Layout breadcrumb={<span>assets</span>}>
			<div className="max-w-3xl mx-auto p-4 sm:p-6">
				<Section
					title="Assets"
					eyebrow={`${list.length} files`}
					action={
						<div className="flex items-center gap-1.5">
							{selCount > 0 ? (
								<Button
									size="sm"
									variant="outline"
									onClick={downloadZip}
									className="gap-1.5"
								>
									<Download className="w-3.5 h-3.5" /> Download {selCount}{" "}
									(.zip)
								</Button>
							) : null}
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
						</div>
					}
				>
					{/* Filter row: kind chips + name search */}
					<div className="flex flex-wrap items-center gap-1.5 mb-3">
						{kinds.map((k) => (
							<button
								type="button"
								key={k}
								onClick={() => setKind(k)}
								className={`text-xs px-2.5 py-1 rounded-full border-2 font-medium transition-colors ${
									kind === k
										? "border-transparent bg-primary text-primary-foreground"
										: "border-border text-muted-foreground hover:border-primary/40"
								}`}
							>
								{k === "all" ? "All" : (KIND_LABEL[k] ?? k)}
							</button>
						))}
						<Input
							placeholder="Search by name…"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="h-7 text-xs ml-auto w-40"
						/>
					</div>

					{list.length === 0 ? (
						<p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground bg-secondary/40">
							Nothing uploaded yet. Drop a lab report, vaccine card, or photo —
							it's stored here and filed into the timeline automatically.
						</p>
					) : (
						<>
							<label className="flex items-center gap-2 px-1 pb-2 text-xs text-muted-foreground cursor-pointer">
								<Checkbox
									checked={allFilteredSelected}
									onCheckedChange={toggleAll}
								/>
								Select all{kind !== "all" || query ? " (filtered)" : ""} ·{" "}
								{filtered.length} shown
							</label>
							<div className="space-y-2">
								{filtered.map((a) => (
									<AssetRow
										key={a.id}
										asset={a}
										checked={selected.has(a.id)}
										onToggle={() => toggle(a.id)}
									/>
								))}
								{filtered.length === 0 ? (
									<p className="text-sm text-muted-foreground px-1 py-3">
										No files match this filter.
									</p>
								) : null}
							</div>
						</>
					)}
				</Section>
			</div>
		</Layout>
	);
}

function AssetRow({
	asset,
	checked,
	onToggle,
}: {
	asset: Asset;
	checked: boolean;
	onToggle: () => void;
}) {
	return (
		<div className="flex items-center gap-3 rounded-xl bg-card surface p-3">
			<Checkbox checked={checked} onCheckedChange={onToggle} />
			<FileText className="w-4 h-4 text-muted-foreground shrink-0" />
			<div className="flex-1 min-w-0">
				<div className="truncate text-sm">{asset.originalName ?? asset.id}</div>
				<div className="text-[10px] text-muted-foreground">
					{KIND_LABEL[asset.kind] ?? asset.kind} ·{" "}
					{formatDateTime(asset.uploadedAt)}
				</div>
			</div>
			<a
				href={`/api/files/${asset.id}`}
				target="_blank"
				rel="noreferrer"
				className="shrink-0 text-xs text-primary hover:underline inline-flex items-center gap-1"
				title="Open"
			>
				Open <ExternalLink className="w-3 h-3" />
			</a>
		</div>
	);
}
