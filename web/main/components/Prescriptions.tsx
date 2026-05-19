import { ExternalLink, FileText, Pill, Upload, Utensils } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { formatDateTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import type { Prescription, ScheduleItem } from "@/types/api.ts";
import { useUploadPrescription } from "../lib/queries.ts";

interface Props {
	episodeId: string;
	prescriptions: Prescription[];
	onDraftCreated: (rx: Prescription) => void;
}

export function Prescriptions({
	episodeId,
	prescriptions,
	onDraftCreated,
}: Props) {
	const upload = useUploadPrescription();
	const [sourceNotes, setSourceNotes] = useState("");

	const handleFile = async (file: File) => {
		try {
			const buf = await file.arrayBuffer();
			const bytes = new Uint8Array(buf);
			let binary = "";
			const chunkSize = 0x8000;
			for (let i = 0; i < bytes.length; i += chunkSize) {
				binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
			}
			const base64 = btoa(binary);
			const rx = await upload.mutateAsync({
				episodeId,
				imageBase64: base64,
				mimeType: file.type || "image/jpeg",
				originalName: file.name,
				sourceNotes: sourceNotes || undefined,
			});
			onDraftCreated(rx);
			setSourceNotes("");
			toast.success("Prescription extracted — review and confirm");
		} catch (err) {
			toast.error((err as Error).message);
		}
	};

	const sorted = [...prescriptions].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	return (
		<div className="space-y-3">
			<div className="rounded-2xl bg-card surface p-4 space-y-3">
				<Input
					placeholder="Optional context (vet instructions, first-dose time…)"
					value={sourceNotes}
					onChange={(e) => setSourceNotes(e.target.value)}
				/>
				<label className="inline-flex">
					<input
						type="file"
						accept="image/*,application/pdf"
						className="sr-only"
						onChange={(e) => {
							const f = e.target.files?.[0];
							if (f) handleFile(f);
							e.target.value = "";
						}}
						disabled={upload.isPending}
					/>
					<Button
						size="sm"
						type="button"
						disabled={upload.isPending}
						onClick={(e) => {
							const input = (
								e.currentTarget.parentElement as HTMLLabelElement
							).querySelector("input");
							input?.click();
						}}
					>
						<Upload className="w-3.5 h-3.5" />
						{upload.isPending
							? "Uploading + extracting…"
							: "Upload prescription photo"}
					</Button>
				</label>
				{upload.error ? (
					<p className="text-xs text-destructive">
						{(upload.error as Error).message}
					</p>
				) : null}
			</div>

			{sorted.length === 0 ? (
				<p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground bg-secondary/40">
					No prescriptions yet. Upload a photo above — the AI will extract the
					schedule and let you review it before confirming.
				</p>
			) : (
				<div className="space-y-3">
					{sorted.map((rx) => (
						<PrescriptionCard key={rx.id} rx={rx} />
					))}
				</div>
			)}
		</div>
	);
}

function PrescriptionCard({ rx }: { rx: Prescription }) {
	const isImage = rx.fileId !== null;
	const fileUrl = rx.fileId ? `/api/files/${rx.fileId}` : null;

	return (
		<article className="rounded-2xl bg-card surface overflow-hidden">
			<div className="flex items-start gap-3 p-4 border-b border-border/60">
				{isImage && fileUrl ? (
					<a
						href={fileUrl}
						target="_blank"
						rel="noreferrer"
						className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-secondary border border-border/60 hover:border-primary/40 transition-colors"
						title="Open original"
					>
						<img
							src={fileUrl}
							alt="Prescription"
							className="w-full h-full object-cover"
							loading="lazy"
						/>
					</a>
				) : (
					<div className="shrink-0 w-16 h-16 rounded-lg flex items-center justify-center bg-secondary text-muted-foreground border border-border/60">
						<FileText className="w-5 h-5" />
					</div>
				)}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<Badge
							variant={rx.status === "confirmed" ? "default" : "outline"}
							className="text-[10px] uppercase tracking-wider"
						>
							{rx.status}
						</Badge>
						<span className="text-xs text-muted-foreground">
							{formatDateTime(rx.createdAt)}
						</span>
					</div>
					<div className="font-display text-base font-semibold mt-0.5">
						{rx.scheduleItems.length} item
						{rx.scheduleItems.length === 1 ? "" : "s"} extracted
					</div>
					{rx.sourceNotes ? (
						<p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
							{rx.sourceNotes}
						</p>
					) : null}
				</div>
				{fileUrl ? (
					<a
						href={fileUrl}
						target="_blank"
						rel="noreferrer"
						className="shrink-0 text-xs text-primary hover:underline inline-flex items-center gap-1"
					>
						Open
						<ExternalLink className="w-3 h-3" />
					</a>
				) : null}
			</div>

			{rx.scheduleItems.length > 0 ? (
				<ul className="divide-y">
					{rx.scheduleItems.map((item, i) => (
						<ScheduleItemRow key={`${rx.id}-${i}-${item.name}`} item={item} />
					))}
				</ul>
			) : (
				<p className="p-4 text-xs text-muted-foreground">
					No items were extracted from this document.
				</p>
			)}
		</article>
	);
}

function ScheduleItemRow({ item }: { item: ScheduleItem }) {
	const isMeal = item.kind === "meal";
	const meta: string[] = [];
	if (item.dosage)
		meta.push(item.route ? `${item.dosage} (${item.route})` : item.dosage);
	if (item.frequencyHours) meta.push(`every ${item.frequencyHours}h`);
	if (item.durationDays) meta.push(`for ${item.durationDays}d`);

	return (
		<li className="flex items-start gap-3 p-3.5">
			<div
				className={cn(
					"shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5",
					isMeal
						? "bg-[var(--color-tint-meal)] text-[var(--color-accent-meal)]"
						: "bg-[var(--color-tint-med)] text-[var(--color-accent-med)]",
				)}
			>
				{isMeal ? (
					<Utensils className="w-3.5 h-3.5" />
				) : (
					<Pill className="w-3.5 h-3.5" />
				)}
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 flex-wrap">
					<span className="font-medium truncate">{item.name}</span>
					<div className="flex flex-wrap gap-1">
						{item.times.map((t) => (
							<span
								key={t}
								className="font-time tabular-nums text-xs px-1.5 py-0 rounded-md bg-secondary/60 text-foreground/80"
							>
								{t}
							</span>
						))}
					</div>
				</div>
				{meta.length > 0 ? (
					<div className="text-xs text-muted-foreground mt-0.5">
						{meta.join(" · ")}
					</div>
				) : null}
				{item.notes ? (
					<p className="text-xs text-muted-foreground/80 mt-0.5 whitespace-pre-wrap">
						{item.notes}
					</p>
				) : null}
			</div>
		</li>
	);
}
