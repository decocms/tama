import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, FileText, FlaskConical } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { formatDateTime } from "@/lib/format.ts";
import type { Exam, ExamMetricSeriesPoint } from "@/types/api.ts";
import {
	ExplainButton,
	InsightsCard,
	useExplainState,
} from "../components/ExamInsights.tsx";
import { ExamReview } from "../components/ExamReview.tsx";
import { ExamUploadQueue } from "../components/ExamUploadQueue.tsx";
import { Layout } from "../components/Layout.tsx";
import { MetricChart } from "../components/MetricChart.tsx";
import { Section } from "../components/Section.tsx";
import {
	useExam,
	useExams,
	useMetricSeries,
	usePasteExam,
	usePet,
} from "../lib/queries.ts";
import {
	PANEL_DEFAULT_KEYS,
	PANEL_LABEL,
	PANELS,
	TAXONOMY_BY_KEY,
} from "../lib/taxonomy.ts";

export function ExamsPage() {
	const navigate = useNavigate();
	const { data: pet } = usePet();
	const { data: exams, isLoading } = useExams();
	const { data: series, isPending: seriesPending } = useMetricSeries([]);
	const [reviewingId, setReviewingId] = useState<string | null>(null);
	const explain = useExplainState();
	const hasData = (series ?? []).length > 0;

	return (
		<Layout
			breadcrumb={<span>exams</span>}
		>
			<div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
				<Section
					title="Panel overview"
					eyebrow="Evolution"
					action={
						<div className="flex items-center gap-2">
							<ExplainButton
								onClick={() => explain.run()}
								pending={explain.pending}
								disabled={!hasData}
							/>
							<Button
								size="sm"
								variant="outline"
								onClick={() =>
									navigate({
										to: "/exams/detail",
										search: { keys: undefined },
									})
								}
							>
								Detail view
							</Button>
						</div>
					}
				>
					<InsightsCard
						pending={explain.pending}
						error={explain.error}
						text={explain.text}
						petName={pet?.name}
					/>

					{seriesPending ? (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<Skeleton className="h-48 w-full rounded-2xl" />
							<Skeleton className="h-48 w-full rounded-2xl" />
						</div>
					) : (
						<PanelOverview
							series={series ?? []}
							onSelectPanel={(panel) =>
								navigate({
									to: "/exams/detail",
									search: { keys: PANEL_DEFAULT_KEYS[panel].join(",") },
								})
							}
						/>
					)}
				</Section>

				<Section title="Upload a lab exam" eyebrow="New exam">
					<UploadCard onCreated={(examId) => setReviewingId(examId)} />
				</Section>

				{reviewingId ? (
					<Section title="Review extracted metrics" eyebrow="Draft">
						<ExamReviewLoader
							examId={reviewingId}
							onClose={() => setReviewingId(null)}
						/>
					</Section>
				) : null}

				<Section title="History" eyebrow={`${exams?.length ?? 0} exams`}>
					{isLoading ? (
						<Skeleton className="h-16 w-full rounded-xl" />
					) : (
						<ExamHistory
							exams={exams ?? []}
							onOpen={(id) => setReviewingId(id)}
						/>
					)}
				</Section>
			</div>
		</Layout>
	);
}

function ExamReviewLoader({
	examId,
	onClose,
}: {
	examId: string;
	onClose: () => void;
}) {
	const { data, isLoading } = useExam(examId);
	if (isLoading || !data?.exam) {
		return <Skeleton className="h-32 w-full rounded-xl" />;
	}
	return (
		<ExamReview
			exam={data.exam}
			metrics={data.metrics}
			onConfirmed={onClose}
			onDeleted={onClose}
		/>
	);
}

function UploadCard({ onCreated }: { onCreated: (examId: string) => void }) {
	const paste = usePasteExam();
	const [sourceNotes, setSourceNotes] = useState("");
	const [pasteText, setPasteText] = useState("");

	const handlePaste = async () => {
		if (pasteText.trim().length < 20) {
			toast.error("Paste at least a short block of lab text");
			return;
		}
		try {
			const result = await paste.mutateAsync({
				text: pasteText,
				sourceNotes: sourceNotes || undefined,
			});
			onCreated(result.exam.id);
			setPasteText("");
			setSourceNotes("");
			toast.success(
				`Extracted ${result.metrics.length} metrics — review and confirm`,
			);
		} catch (err) {
			toast.error((err as Error).message);
		}
	};

	return (
		<div className="rounded-2xl bg-card surface p-4 space-y-3">
			<Input
				placeholder="Optional context (which vet, why drawn, …)"
				value={sourceNotes}
				onChange={(e) => setSourceNotes(e.target.value)}
			/>

			<Tabs defaultValue="file">
				<TabsList>
					<TabsTrigger value="file">Upload files</TabsTrigger>
					<TabsTrigger value="paste">Paste text</TabsTrigger>
				</TabsList>
				<TabsContent value="file" className="pt-3">
					<ExamUploadQueue
						sourceNotes={sourceNotes}
						onCreated={onCreated}
						onClearNotes={() => setSourceNotes("")}
					/>
				</TabsContent>
				<TabsContent value="paste" className="pt-3 space-y-2">
					<Textarea
						placeholder="Paste lab report text here (e.g. an email body, an OCR'd screenshot, or markdown notes)…"
						rows={6}
						value={pasteText}
						onChange={(e) => setPasteText(e.target.value)}
					/>
					<Button
						size="sm"
						onClick={handlePaste}
						disabled={paste.isPending}
					>
						<FlaskConical className="w-3.5 h-3.5" />
						{paste.isPending ? "Extracting…" : "Extract metrics"}
					</Button>
				</TabsContent>
			</Tabs>
		</div>
	);
}

function PanelOverview({
	series,
	onSelectPanel,
}: {
	series: ExamMetricSeriesPoint[];
	onSelectPanel: (panel: (typeof PANELS)[number]) => void;
}) {
	const seenKeys = useMemo(
		() => new Set(series.map((p) => p.canonicalKey)),
		[series],
	);

	const visiblePanels = PANELS.filter((p) =>
		PANEL_DEFAULT_KEYS[p].some((k) => seenKeys.has(k)),
	);

	if (series.length === 0) {
		return (
			<p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground bg-secondary/40">
				No confirmed exams yet. Upload one above and confirm it — the charts
				will fill in here.
			</p>
		);
	}

	if (visiblePanels.length === 0) {
		return (
			<p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground bg-secondary/40">
				Confirmed metrics exist, but none in the curated panels yet. Open the
				detail view to chart what's there.
			</p>
		);
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
			{visiblePanels.map((panel) => {
				const keys = PANEL_DEFAULT_KEYS[panel].filter((k) => seenKeys.has(k));
				return (
					<button
						type="button"
						key={panel}
						onClick={() => onSelectPanel(panel)}
						className="text-left rounded-2xl bg-card surface p-4 hover:border-primary/30 transition-colors space-y-2"
					>
						<div className="flex items-center justify-between">
							<div className="font-display font-semibold">
								{PANEL_LABEL[panel]}
							</div>
							<div className="text-[10px] text-muted-foreground">
								{keys.map((k) => TAXONOMY_BY_KEY[k]?.label).join(" · ")}
							</div>
						</div>
						<MetricChart series={series} keys={keys} height={160} />
					</button>
				);
			})}
		</div>
	);
}

function ExamHistory({
	exams,
	onOpen,
}: {
	exams: Exam[];
	onOpen: (id: string) => void;
}) {
	if (exams.length === 0) {
		return (
			<p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground bg-secondary/40">
				No exams uploaded yet.
			</p>
		);
	}
	const sorted = [...exams].sort((a, b) =>
		(b.performedAt ?? b.createdAt).localeCompare(a.performedAt ?? a.createdAt),
	);
	return (
		<div className="space-y-2">
			{sorted.map((e) => (
				<button
					type="button"
					key={e.id}
					onClick={() => onOpen(e.id)}
					className="w-full text-left rounded-xl bg-card surface p-3.5 flex items-start gap-3 hover:border-primary/30 transition-colors"
				>
					<div className="shrink-0 w-9 h-9 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center">
						<FileText className="w-4 h-4" />
					</div>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 flex-wrap">
							<Badge
								variant={e.status === "confirmed" ? "default" : "outline"}
								className="text-[10px] uppercase tracking-wider"
							>
								{e.status}
							</Badge>
							{e.performedAt ? (
								<span className="text-xs text-muted-foreground">
									{formatDateTime(e.performedAt)}
								</span>
							) : (
								<span className="text-xs text-muted-foreground">
									Added {formatDateTime(e.createdAt)}
								</span>
							)}
						</div>
						<div className="font-medium mt-0.5 truncate">
							{e.labName ?? "Lab exam"}
							{e.requestId ? (
								<span className="text-muted-foreground font-normal">
									{" "}
									· {e.requestId}
								</span>
							) : null}
						</div>
					</div>
					{e.fileId ? (
						<a
							href={`/api/files/${e.fileId}`}
							target="_blank"
							rel="noreferrer"
							className="shrink-0 text-xs text-primary hover:underline inline-flex items-center gap-1"
							onClick={(ev) => ev.stopPropagation()}
						>
							Open
							<ExternalLink className="w-3 h-3" />
						</a>
					) : null}
				</button>
			))}
		</div>
	);
}
