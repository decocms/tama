import { AlertCircle, FileText, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { useUploadExam } from "../lib/queries.ts";

type QueueStatus = "queued" | "extracting" | "ready" | "error";

interface QueueItem {
	localId: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	status: QueueStatus;
	examId?: string;
	metricCount?: number;
	pendingReviewCount?: number;
	error?: string;
}

interface Props {
	episodeId: string | undefined;
	sourceNotes: string;
	onCreated: (examId: string) => void;
	onClearNotes: () => void;
}

function fileToBase64(file: File): Promise<string> {
	return file.arrayBuffer().then((buf) => {
		const bytes = new Uint8Array(buf);
		let binary = "";
		const chunkSize = 0x8000;
		for (let i = 0; i < bytes.length; i += chunkSize) {
			binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
		}
		return btoa(binary);
	});
}

function fmtBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExamUploadQueue({
	episodeId,
	sourceNotes,
	onCreated,
	onClearNotes,
}: Props) {
	const upload = useUploadExam();
	const [items, setItems] = useState<QueueItem[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);
	const idCounter = useRef(0);

	const updateItem = (localId: string, patch: Partial<QueueItem>) => {
		setItems((prev) =>
			prev.map((it) => (it.localId === localId ? { ...it, ...patch } : it)),
		);
	};

	const handleFiles = async (files: File[]) => {
		if (!episodeId) {
			toast.error("Pick an episode first");
			return;
		}
		const queued: QueueItem[] = files.map((f) => {
			idCounter.current += 1;
			return {
				localId: `q_${idCounter.current}_${Date.now()}`,
				fileName: f.name,
				mimeType: f.type || "application/pdf",
				sizeBytes: f.size,
				status: "queued" as const,
			};
		});
		setItems((prev) => [...queued, ...prev]);

		// Fire all uploads in parallel. The LLM extraction is the bottleneck,
		// so 4 simultaneous calls finish ~4× faster than sequential. The
		// useUploadExam mutation hook tolerates concurrent .mutateAsync calls
		// — each one has its own request lifecycle.
		const notesForBatch = sourceNotes.trim() || undefined;
		const settled = await Promise.allSettled(
			queued.map(async (item, idx) => {
				updateItem(item.localId, { status: "extracting" });
				try {
					const base64 = await fileToBase64(files[idx]);
					const result = await upload.mutateAsync({
						episodeId,
						imageBase64: base64,
						mimeType: item.mimeType,
						originalName: item.fileName,
						sourceNotes: notesForBatch,
					});
					updateItem(item.localId, {
						status: "ready",
						examId: result.exam.id,
						metricCount: result.metrics.length,
						pendingReviewCount: result.pendingReviewCount,
					});
					return { ok: true as const, examId: result.exam.id };
				} catch (err) {
					updateItem(item.localId, {
						status: "error",
						error: (err as Error).message,
					});
					return { ok: false as const, err };
				}
			}),
		);

		const okCount = settled.filter(
			(s) => s.status === "fulfilled" && s.value.ok,
		).length;
		const errCount = settled.length - okCount;

		if (okCount > 0) {
			toast.success(
				okCount === 1
					? "Exam extracted — review and confirm"
					: `${okCount} exams extracted — review each below`,
			);
			onClearNotes();
		}
		if (errCount > 0) {
			toast.error(
				errCount === 1
					? "1 file failed to extract"
					: `${errCount} files failed to extract`,
			);
		}
	};

	const clearDone = () =>
		setItems((prev) =>
			prev.filter((i) => i.status !== "ready" && i.status !== "error"),
		);

	const inFlight = items.filter(
		(i) => i.status === "queued" || i.status === "extracting",
	).length;
	const noEpisode = !episodeId;

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<input
					ref={inputRef}
					type="file"
					accept="image/*,application/pdf"
					multiple
					className="sr-only"
					disabled={noEpisode}
					onChange={(e) => {
						const fs = Array.from(e.target.files ?? []);
						if (fs.length > 0) handleFiles(fs);
						e.target.value = "";
					}}
				/>
				<Button
					type="button"
					size="sm"
					disabled={noEpisode}
					onClick={() => inputRef.current?.click()}
				>
					<Upload className="w-3.5 h-3.5" />
					{inFlight > 0
						? `Extracting ${inFlight}…`
						: "Upload PDFs or photos"}
				</Button>
				{items.length > 0 ? (
					<>
						<span className="text-xs text-muted-foreground">
							{items.length} file{items.length === 1 ? "" : "s"}
							{inFlight > 0 ? ` · ${inFlight} in flight` : ""}
						</span>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={clearDone}
							disabled={inFlight === items.length}
						>
							Clear done
						</Button>
					</>
				) : null}
			</div>

			{items.length > 0 ? (
				<ul className="rounded-xl border divide-y bg-card overflow-hidden">
					{items.map((it) => (
						<QueueRow
							key={it.localId}
							item={it}
							onReview={(examId) => onCreated(examId)}
						/>
					))}
				</ul>
			) : null}
		</div>
	);
}

function QueueRow({
	item,
	onReview,
}: {
	item: QueueItem;
	onReview: (examId: string) => void;
}) {
	return (
		<li
			className={cn(
				"flex items-center gap-3 px-3.5 py-2.5",
				item.status === "ready" ? "bg-primary/5" : "",
				item.status === "error" ? "bg-destructive/5" : "",
			)}
		>
			<div className="shrink-0 w-7 h-7 rounded-md bg-secondary text-muted-foreground flex items-center justify-center">
				{item.status === "error" ? (
					<AlertCircle className="w-3.5 h-3.5 text-destructive" />
				) : (
					<FileText className="w-3.5 h-3.5" />
				)}
			</div>
			<div className="flex-1 min-w-0">
				<div className="font-medium text-sm truncate">{item.fileName}</div>
				<div className="text-xs text-muted-foreground truncate">
					{fmtBytes(item.sizeBytes)}
					{item.status === "ready" && item.metricCount != null ? (
						<>
							{" · "}
							{item.metricCount} metric{item.metricCount === 1 ? "" : "s"}
							{item.pendingReviewCount && item.pendingReviewCount > 0
								? ` · ${item.pendingReviewCount} to review`
								: ""}
						</>
					) : null}
					{item.status === "error" && item.error ? (
						<>
							{" · "}
							{item.error}
						</>
					) : null}
				</div>
			</div>
			<StatusBadge status={item.status} />
			{item.status === "ready" && item.examId ? (
				<Button
					size="sm"
					variant="outline"
					onClick={() => onReview(item.examId as string)}
				>
					Review
				</Button>
			) : null}
		</li>
	);
}

function StatusBadge({ status }: { status: QueueStatus }) {
	const map: Record<QueueStatus, { label: string; cls: string }> = {
		queued: { label: "queued", cls: "" },
		extracting: { label: "extracting", cls: "" },
		ready: { label: "ready", cls: "border-primary/40 text-primary" },
		error: { label: "error", cls: "border-destructive/40 text-destructive" },
	};
	const m = map[status];
	const pulse =
		status === "queued" || status === "extracting"
			? "animate-pulse"
			: "";
	return (
		<Badge
			variant="outline"
			className={cn("text-[10px] shrink-0", m.cls, pulse)}
		>
			{m.label}
		</Badge>
	);
}
