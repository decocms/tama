import { Upload } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { formatDateTime } from "@/lib/format.ts";
import type { Prescription } from "@/types/api.ts";
import {
	useAddNote,
	useEpisode,
	useUploadPrescription,
} from "../lib/queries.ts";
import { PrescriptionReview } from "./PrescriptionReview.tsx";
import { Recordings } from "./Recordings.tsx";
import { Timetable } from "./Timetable.tsx";

export function EpisodeView({ episodeId }: { episodeId: string }) {
	const { data, isLoading } = useEpisode(episodeId);
	const upload = useUploadPrescription();
	const addNote = useAddNote(episodeId);

	const [draftRx, setDraftRx] = useState<Prescription | null>(null);
	const [sourceNotes, setSourceNotes] = useState("");
	const [noteContent, setNoteContent] = useState("");

	if (isLoading || !data?.episode) {
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	}
	const ep = data.episode;

	const handleFile = async (file: File) => {
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
		setDraftRx(rx);
		setSourceNotes("");
	};

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center justify-between">
						<span className="flex items-center gap-2">
							{ep.title}
							<Badge variant={ep.status === "open" ? "default" : "secondary"}>
								{ep.status}
							</Badge>
						</span>
					</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground space-y-1">
					<div>Started {formatDateTime(ep.startedAt)}</div>
					{ep.summary ? (
						<p className="whitespace-pre-wrap">{ep.summary}</p>
					) : null}
				</CardContent>
			</Card>

			<section>
				<h2 className="text-lg font-semibold mb-2">Timetable</h2>
				<Timetable episodeId={episodeId} entries={data.timetable} />
			</section>

			<section>
				<h2 className="text-lg font-semibold mb-2">Prescriptions</h2>
				<Card>
					<CardContent className="p-4 space-y-3">
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
								<Upload className="w-3 h-3" />
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
						{data.prescriptions.length > 0 ? (
							<ul className="text-sm space-y-1">
								{data.prescriptions.map((rx) => (
									<li key={rx.id} className="flex items-center justify-between">
										<span>
											{rx.itemCount} item{rx.itemCount === 1 ? "" : "s"} •{" "}
											{new Date(rx.createdAt).toLocaleString()}
										</span>
										<Badge
											variant={
												rx.status === "confirmed" ? "default" : "outline"
											}
										>
											{rx.status}
										</Badge>
									</li>
								))}
							</ul>
						) : null}
					</CardContent>
				</Card>
			</section>

			{draftRx ? (
				<PrescriptionReview
					prescription={draftRx}
					onConfirmed={() => setDraftRx(null)}
				/>
			) : null}

			<section>
				<h2 className="text-lg font-semibold mb-2">Recordings</h2>
				<Recordings episodeId={episodeId} />
			</section>

			<section>
				<h2 className="text-lg font-semibold mb-2">Notes</h2>
				<Card>
					<CardContent className="p-4 space-y-3">
						<Input
							placeholder="Add a note or paste a chat log…"
							value={noteContent}
							onChange={(e) => setNoteContent(e.target.value)}
						/>
						<div className="flex gap-2">
							<Button
								size="sm"
								variant="outline"
								disabled={!noteContent || addNote.isPending}
								onClick={() =>
									addNote
										.mutateAsync({ kind: "text", content: noteContent })
										.then(() => setNoteContent(""))
								}
							>
								Add text note
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={!noteContent || addNote.isPending}
								onClick={() =>
									addNote
										.mutateAsync({ kind: "chatlog", content: noteContent })
										.then(() => setNoteContent(""))
								}
							>
								Add chat log
							</Button>
						</div>
						{data.notes.length > 0 ? (
							<ul className="space-y-3">
								{data.notes.map((n) => (
									<li key={n.id} className="text-sm border-l-2 pl-3">
										<div className="text-xs text-muted-foreground mb-1">
											{n.kind} • {new Date(n.createdAt).toLocaleString()}
										</div>
										<p className="whitespace-pre-wrap">{n.content}</p>
									</li>
								))}
							</ul>
						) : null}
					</CardContent>
				</Card>
			</section>
		</div>
	);
}
