import { Mic, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { decodeAndChunk, fileToBase64 } from "../lib/audio.ts";
import {
	useAddChunk,
	useApplyRecording,
	useCreateRecording,
	useRecording,
	useRecordings,
	useSummarizeRecording,
	useTranscribeRecording,
} from "../lib/queries.ts";

export function Recordings({ episodeId }: { episodeId: string }) {
	const { data: recordings } = useRecordings(episodeId);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [progress, setProgress] = useState<string | null>(null);

	const create = useCreateRecording();
	const addChunk = useAddChunk();
	const transcribe = useTranscribeRecording();

	const handleFile = async (file: File) => {
		setProgress(`reading ${file.name}…`);
		try {
			const original = await fileToBase64(file);
			setProgress("decoding + chunking…");
			const { durationS, chunks } = await decodeAndChunk(file, {
				onProgress: (m) => setProgress(m),
			});

			setProgress("creating recording…");
			const rec = await create.mutateAsync({
				episodeId,
				mimeType: file.type || "audio/mpeg",
				originalName: file.name,
				durationS,
				numChunks: chunks.length,
				originalBase64: original,
			});
			setActiveId(rec.id);

			for (const ch of chunks) {
				setProgress(`uploading chunk ${ch.idx + 1}/${chunks.length}…`);
				await addChunk.mutateAsync({
					recordingId: rec.id,
					idx: ch.idx,
					startS: ch.startS,
					endS: ch.endS,
					audioBase64: ch.base64,
				});
			}

			setProgress("transcribing…");
			await transcribe.mutateAsync({ recordingId: rec.id });
			setProgress(null);
		} catch (err) {
			setProgress(`failed: ${(err as Error).message}`);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base flex items-center gap-2">
					<Mic className="w-4 h-4" /> Recordings
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				<label className="inline-flex">
					<input
						type="file"
						accept="audio/*,video/mp4,video/quicktime"
						className="sr-only"
						onChange={(e) => {
							const f = e.target.files?.[0];
							if (f) handleFile(f);
							e.target.value = "";
						}}
						disabled={!!progress}
					/>
					<Button
						size="sm"
						type="button"
						disabled={!!progress}
						onClick={(e) => {
							const input = (
								e.currentTarget.parentElement as HTMLLabelElement
							).querySelector("input");
							input?.click();
						}}
					>
						<Mic className="w-3 h-3" /> Upload audio
					</Button>
				</label>
				{progress ? (
					<p className="text-xs text-muted-foreground">{progress}</p>
				) : null}

				{recordings && recordings.length > 0 ? (
					<ul className="space-y-2">
						{recordings.map((r) => (
							<li key={r.id}>
								<RecordingRow
									recordingId={r.id}
									expanded={activeId === r.id}
									onToggle={() => setActiveId(activeId === r.id ? null : r.id)}
								/>
							</li>
						))}
					</ul>
				) : null}
			</CardContent>
		</Card>
	);
}

function RecordingRow({
	recordingId,
	expanded,
	onToggle,
}: {
	recordingId: string;
	expanded: boolean;
	onToggle: () => void;
}) {
	const { data } = useRecording(recordingId);
	const summarize = useSummarizeRecording();
	const apply = useApplyRecording();
	const [historyEdit, setHistoryEdit] = useState<string | null>(null);
	const [noteEdit, setNoteEdit] = useState<string | null>(null);

	if (!data?.recording) return null;
	const rec = data.recording;
	const chunks = data.chunks;
	const transcribedChunks = chunks.filter((c) => c.transcript).length;

	return (
		<div className="rounded-md border">
			<button
				type="button"
				onClick={onToggle}
				className="w-full flex items-center justify-between p-3 text-left hover:bg-accent"
			>
				<div className="text-sm">
					<div className="font-medium truncate">
						{rec.originalName ?? rec.id}
					</div>
					<div className="text-xs text-muted-foreground">
						{rec.durationS ? `${Math.round(rec.durationS)}s • ` : ""}
						{transcribedChunks}/{rec.numChunks} chunks
					</div>
				</div>
				<StatusBadge status={rec.status} />
			</button>
			{expanded ? (
				<div className="p-3 border-t space-y-3">
					{rec.error ? (
						<p className="text-xs text-destructive">{rec.error}</p>
					) : null}

					{rec.fullTranscript ? (
						<details className="text-sm">
							<summary className="cursor-pointer text-muted-foreground">
								Full transcript ({rec.fullTranscript.length} chars)
							</summary>
							<pre className="whitespace-pre-wrap mt-2 text-xs">
								{rec.fullTranscript}
							</pre>
						</details>
					) : null}

					{rec.status === "transcribed" && !rec.summary ? (
						<Button
							size="sm"
							onClick={() => summarize.mutate(recordingId)}
							disabled={summarize.isPending}
						>
							<Sparkles className="w-3 h-3" />
							{summarize.isPending
								? "Summarizing…"
								: "Summarize + propose updates"}
						</Button>
					) : null}

					{rec.summary || rec.historyUpdate ? (
						<div className="space-y-3">
							<EditablePane
								title="Summary / episode note"
								value={noteEdit ?? rec.summary ?? ""}
								onChange={setNoteEdit}
							/>
							<EditablePane
								title="Long-term history update (appended to pet notes)"
								value={historyEdit ?? rec.historyUpdate ?? ""}
								onChange={setHistoryEdit}
							/>
							{rec.status !== "applied" ? (
								<div className="flex gap-2">
									<Button
										size="sm"
										onClick={() =>
											apply.mutate({
												recordingId,
												historyUpdate: historyEdit ?? rec.historyUpdate ?? "",
												episodeNote: noteEdit ?? rec.summary ?? "",
											})
										}
										disabled={apply.isPending}
									>
										{apply.isPending ? "Applying…" : "Apply to pet + episode"}
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={() =>
											apply.mutate({
												recordingId,
												historyUpdate: "",
												episodeNote: "",
											})
										}
										disabled={apply.isPending}
									>
										Discard
									</Button>
								</div>
							) : (
								<p className="text-xs text-muted-foreground">
									Applied. Pet notes and episode notes updated.
								</p>
							)}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function EditablePane({
	title,
	value,
	onChange,
}: {
	title: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div>
			<div className="text-xs uppercase text-muted-foreground mb-1">
				{title}
			</div>
			<textarea
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="w-full text-sm rounded-md border bg-background p-2 min-h-[80px]"
			/>
		</div>
	);
}

function StatusBadge({ status }: { status: string }) {
	const variant: "default" | "secondary" | "destructive" | "outline" =
		status === "applied" || status === "summarized"
			? "default"
			: status === "error"
				? "destructive"
				: "outline";
	return (
		<Badge variant={variant} className="text-xs">
			{status}
		</Badge>
	);
}
