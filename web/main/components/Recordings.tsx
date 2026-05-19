import { Check, Mic, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { cn } from "@/lib/utils.ts";
import type { Recording } from "@/types/api.ts";
import { decodeAndChunk, fileToBase64 } from "../lib/audio.ts";
import {
	useAddChunk,
	useApplyRecordingGroup,
	useCreateRecording,
	useRecordings,
	useTranscribeRecording,
} from "../lib/queries.ts";

export function Recordings({ episodeId }: { episodeId: string }) {
	const { data: recordings } = useRecordings(episodeId);
	const [progress, setProgress] = useState<string | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const create = useCreateRecording();
	const addChunk = useAddChunk();
	const transcribe = useTranscribeRecording();
	const applyGroup = useApplyRecordingGroup();

	// Auto-select every freshly-transcribed recording so a typical flow is
	// "drop files → wait → click Analyze" without manual ticking. Only flips
	// the box from unchecked → checked; never un-checks user choices.
	useEffect(() => {
		if (!recordings) return;
		setSelected((prev) => {
			let changed = false;
			const next = new Set(prev);
			for (const r of recordings) {
				if (r.status === "transcribed" && !next.has(r.id)) {
					next.add(r.id);
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [recordings]);

	const handleFile = async (file: File) => {
		const label = file.name;
		setProgress(`reading ${label}…`);
		const original = await fileToBase64(file);
		setProgress(`decoding ${label}…`);
		const { durationS, chunks } = await decodeAndChunk(file, {
			onProgress: (m) => setProgress(`${label} · ${m}`),
		});

		const rec = await create.mutateAsync({
			episodeId,
			mimeType: file.type || "audio/mpeg",
			originalName: file.name,
			durationS,
			numChunks: chunks.length,
			originalBase64: original,
		});

		for (const ch of chunks) {
			setProgress(`${label} · uploading chunk ${ch.idx + 1}/${chunks.length}…`);
			await addChunk.mutateAsync({
				recordingId: rec.id,
				idx: ch.idx,
				startS: ch.startS,
				endS: ch.endS,
				audioBase64: ch.base64,
			});
		}

		setProgress(`${label} · transcribing…`);
		await transcribe.mutateAsync({ recordingId: rec.id });
	};

	const handleFiles = async (files: File[]) => {
		try {
			for (const f of files) {
				await handleFile(f);
			}
			setProgress(null);
			toast.success(
				files.length === 1
					? "Audio uploaded and transcribed"
					: `${files.length} audios uploaded and transcribed`,
			);
		} catch (err) {
			setProgress(`failed: ${(err as Error).message}`);
			toast.error((err as Error).message);
		}
	};

	const toggleSelect = (id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const selectableIds = (recordings ?? [])
		.filter((r) => r.status === "transcribed" || r.status === "summarized")
		.map((r) => r.id);

	const handleAnalyze = () => {
		const ids = Array.from(selected).filter((id) => selectableIds.includes(id));
		if (ids.length === 0) return;
		applyGroup.mutate(
			{ episodeId, recordingIds: ids },
			{
				onSuccess: () => {
					setSelected(new Set());
					toast.success(
						ids.length === 1
							? "Analysis applied to notes"
							: `Analysis from ${ids.length} recordings applied to notes`,
					);
				},
				onError: (e) => toast.error((e as Error).message),
			},
		);
	};

	const eligibleSelectedCount = Array.from(selected).filter((id) =>
		selectableIds.includes(id),
	).length;

	return (
		<div className="rounded-2xl bg-card surface overflow-hidden">
			<header className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/60">
				<Mic className="w-4 h-4 text-muted-foreground" />
				<span className="font-display font-semibold">Recordings</span>
				<label className="ml-auto inline-flex">
					<input
						type="file"
						accept="audio/*,video/mp4,video/quicktime"
						multiple
						className="sr-only"
						onChange={(e) => {
							const fs = Array.from(e.target.files ?? []);
							if (fs.length > 0) handleFiles(fs);
							e.target.value = "";
						}}
						disabled={!!progress}
					/>
					<Button
						size="sm"
						variant="outline"
						type="button"
						disabled={!!progress}
						onClick={(e) => {
							const input = (
								e.currentTarget.parentElement as HTMLLabelElement
							).querySelector("input");
							input?.click();
						}}
					>
						<Mic className="w-3.5 h-3.5" /> Upload audio
					</Button>
				</label>
				{eligibleSelectedCount > 0 ? (
					<Button
						size="sm"
						onClick={handleAnalyze}
						disabled={applyGroup.isPending}
					>
						<Sparkles className="w-3.5 h-3.5" />
						{applyGroup.isPending
							? "Analyzing…"
							: eligibleSelectedCount === 1
								? "Analyze 1 recording"
								: `Analyze ${eligibleSelectedCount} together`}
					</Button>
				) : null}
			</header>

			{progress ? (
				<div className="px-4 py-2 text-xs text-muted-foreground bg-secondary/40 border-b">
					{progress}
				</div>
			) : null}

			{recordings && recordings.length > 0 ? (
				<ul className="divide-y">
					{recordings.map((r) => (
						<RecordingRow
							key={r.id}
							recording={r}
							selected={selected.has(r.id)}
							onToggle={() => toggleSelect(r.id)}
						/>
					))}
				</ul>
			) : (
				<div className="px-4 py-6 text-sm text-muted-foreground">
					No recordings yet. Drop one or more audio files above — they'll be
					transcribed automatically. Then tick the ones you want analyzed
					together and click Analyze.
				</div>
			)}
		</div>
	);
}

function RecordingRow({
	recording,
	selected,
	onToggle,
}: {
	recording: Recording;
	selected: boolean;
	onToggle: () => void;
}) {
	const canSelect =
		recording.status === "transcribed" || recording.status === "summarized";
	const isApplied = recording.status === "applied";
	const inProgress =
		recording.status === "uploading" || recording.status === "transcribing";
	const isError = recording.status === "error";

	return (
		<li
			className={cn(
				"flex items-center gap-3 px-4 py-2.5",
				canSelect && selected ? "bg-primary/5" : "",
			)}
		>
			<div className="w-6 flex items-center justify-center">
				{canSelect ? (
					<Checkbox
						checked={selected}
						onCheckedChange={onToggle}
						aria-label="Select for analysis"
					/>
				) : isApplied ? (
					<Check className="w-4 h-4 text-[var(--color-status-given)]" />
				) : isError ? (
					<X className="w-4 h-4 text-[var(--color-status-overdue)]" />
				) : (
					<div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse" />
				)}
			</div>
			<div className="flex-1 min-w-0">
				<div className="font-medium truncate text-sm">
					{recording.originalName ?? recording.id}
				</div>
				<div className="text-xs text-muted-foreground">
					{recording.durationS ? `${Math.round(recording.durationS)}s · ` : ""}
					{recording.numChunks} chunk{recording.numChunks === 1 ? "" : "s"}
					{recording.error ? ` · ${recording.error}` : ""}
				</div>
			</div>
			<StatusBadge status={recording.status} />
		</li>
	);
}

function StatusBadge({ status }: { status: Recording["status"] }) {
	const map: Record<Recording["status"], { label: string; cls: string }> = {
		uploading: { label: "uploading", cls: "" },
		transcribing: { label: "transcribing", cls: "" },
		transcribed: {
			label: "transcribed",
			cls: "border-primary/40 text-primary",
		},
		summarized: { label: "summarized", cls: "border-primary/40 text-primary" },
		applied: {
			label: "applied",
			cls: "border-[var(--color-status-given)]/30 text-[var(--color-status-given)]",
		},
		error: {
			label: "error",
			cls: "border-[var(--color-status-overdue)]/30 text-[var(--color-status-overdue)]",
		},
	};
	const m = map[status];
	return (
		<Badge variant="outline" className={cn("text-[10px] shrink-0", m.cls)}>
			{m.label}
		</Badge>
	);
}
