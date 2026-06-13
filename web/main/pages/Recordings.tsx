import { Check, Mic, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import type { Recording } from "@/types/api.ts";
import { Layout } from "../components/Layout.tsx";
import { Section } from "../components/Section.tsx";
import { decodeAndChunk, fileToBase64 } from "../lib/audio.ts";
import {
	useAddChunk,
	useApplyRecordingGroup,
	useCreateRecording,
	useRecordings,
	useTranscribeRecording,
} from "../lib/queries.ts";

// Recordings surface. Drop one or more audio files → each is decoded into
// Whisper-sized WAV chunks in the browser, uploaded, transcribed, and then
// automatically summarized into the pet's timeline (files dropped together
// become one combined note). Each transcribed row also has its own "Analyze"
// button to (re)summarize it on demand. Pet-scoped — no episodes.
export function RecordingsPage() {
	const { data: recordings } = useRecordings();
	const [progress, setProgress] = useState<string | null>(null);

	const create = useCreateRecording();
	const addChunk = useAddChunk();
	const transcribe = useTranscribeRecording();
	const applyGroup = useApplyRecordingGroup();

	const handleFile = async (file: File): Promise<string> => {
		const label = file.name;
		setProgress(`reading ${label}…`);
		const original = await fileToBase64(file);
		setProgress(`decoding ${label}…`);
		const { durationS, chunks } = await decodeAndChunk(file, {
			onProgress: (m) => setProgress(`${label} · ${m}`),
		});

		const rec = await create.mutateAsync({
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
		return rec.id;
	};

	const handleFiles = async (files: File[]) => {
		try {
			const ids: string[] = [];
			for (const f of files) {
				ids.push(await handleFile(f));
			}
			// Carry the batch all the way to the timeline: the files dropped
			// together are analyzed together into ONE summary note. Without this
			// the upload stopped at "transcribed" and waited for a manual click —
			// which read as "nothing happened".
			if (ids.length > 0) {
				setProgress(
					ids.length === 1 ? "analyzing…" : `analyzing ${ids.length} together…`,
				);
				await applyGroup.mutateAsync({ recordingIds: ids });
			}
			setProgress(null);
			toast.success(
				files.length === 1
					? "Audio transcribed and added to the timeline"
					: `${files.length} audios transcribed and added to the timeline`,
			);
		} catch (err) {
			setProgress(`failed: ${(err as Error).message}`);
			toast.error((err as Error).message);
		}
	};

	return (
		<Layout breadcrumb="Recordings">
			<div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
				<Section
					eyebrow="Voice notes & vet visits"
					title="Recordings"
					action={
						<label className="inline-flex">
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
					}
				>
					<div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
						{progress ? (
							<div className="px-4 py-2 text-xs text-muted-foreground bg-secondary/40 border-b border-border/60">
								{progress}
							</div>
						) : null}

						{recordings && recordings.length > 0 ? (
							<ul className="divide-y divide-border/60">
								{recordings.map((r) => (
									<RecordingRow key={r.id} recording={r} />
								))}
							</ul>
						) : (
							<div className="px-4 py-10 text-sm text-muted-foreground text-center">
								No recordings yet. Drop one or more audio files above — a vet
								visit you recorded, a voice memo about a symptom. They're
								transcribed and summarized into your timeline automatically;
								files dropped together become one combined note.
							</div>
						)}
					</div>
				</Section>
			</div>
		</Layout>
	);
}

function RecordingRow({ recording }: { recording: Recording }) {
	const apply = useApplyRecordingGroup();
	const canAnalyze =
		recording.status === "transcribed" || recording.status === "summarized";
	const isApplied = recording.status === "applied";
	const isError = recording.status === "error";

	const analyze = () =>
		apply.mutate(
			{ recordingIds: [recording.id] },
			{
				onSuccess: () => toast.success("Added to the timeline"),
				onError: (e) => toast.error((e as Error).message),
			},
		);

	return (
		<li className="flex items-start gap-3 px-4 py-3">
			<div className="w-6 flex items-center justify-center mt-0.5">
				{isApplied ? (
					<Check className="w-4 h-4 text-[var(--color-status-given)]" />
				) : isError ? (
					<X className="w-4 h-4 text-[var(--color-status-overdue)]" />
				) : canAnalyze ? (
					<div className="w-2 h-2 rounded-full bg-primary" />
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
				{/* Quick glance: the AI summary once analyzed, else a transcript
				    snippet so transcribed-but-not-yet-analyzed rows still preview. */}
				{recording.summary ? (
					<p className="mt-1 text-xs text-foreground/75 line-clamp-2 leading-snug">
						{recording.summary}
					</p>
				) : recording.fullTranscript ? (
					<p className="mt-1 text-xs text-muted-foreground/80 line-clamp-2 leading-snug italic">
						{recording.fullTranscript}
					</p>
				) : null}
			</div>
			<div className="flex items-center gap-2 shrink-0">
				{canAnalyze ? (
					<Button
						size="sm"
						variant={recording.status === "summarized" ? "outline" : "default"}
						onClick={analyze}
						disabled={apply.isPending}
					>
						<Sparkles className="w-3.5 h-3.5" />
						{apply.isPending
							? "Analyzing…"
							: recording.status === "summarized"
								? "Re-analyze"
								: "Analyze"}
					</Button>
				) : null}
				<StatusBadge status={recording.status} />
			</div>
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
