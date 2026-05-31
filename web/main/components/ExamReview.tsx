import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select.tsx";
import type {
	Exam,
	ExamMetric,
	ExamMetricInput,
	MetricStatus,
} from "@/types/api.ts";
import { useDeleteExam, useUpdateExam } from "../lib/queries.ts";
import { LAB_TAXONOMY, PANEL_LABEL, TAXONOMY_BY_KEY } from "../lib/taxonomy.ts";

const STATUS_OPTIONS: MetricStatus[] = [
	"normal",
	"low",
	"high",
	"abnormal",
	"unknown",
];

function statusVariant(s: MetricStatus): "default" | "destructive" | "outline" {
	if (s === "low" || s === "high" || s === "abnormal") return "destructive";
	if (s === "normal") return "default";
	return "outline";
}

function toInput(m: ExamMetric): ExamMetricInput {
	return {
		canonicalKey: m.canonicalKey,
		displayName: m.displayName,
		valueNum: m.valueNum,
		valueText: m.valueText,
		unit: m.unit,
		refLow: m.refLow,
		refHigh: m.refHigh,
		refText: m.refText,
		status: m.status,
		pendingReview: m.pendingReview,
	};
}

export function ExamReview({
	exam,
	metrics,
	onConfirmed,
	onDeleted,
}: {
	exam: Exam;
	metrics: ExamMetric[];
	onConfirmed?: () => void;
	onDeleted?: () => void;
}) {
	const update = useUpdateExam();
	const del = useDeleteExam();
	const [rows, setRows] = useState<ExamMetricInput[]>(metrics.map(toInput));
	const [performedAt, setPerformedAt] = useState(exam.performedAt ?? "");
	const [labName, setLabName] = useState(exam.labName ?? "");
	const [requestId, setRequestId] = useState(exam.requestId ?? "");

	// Re-seed local state if the parent swaps in a different exam.
	useEffect(() => {
		setRows(metrics.map(toInput));
		setPerformedAt(exam.performedAt ?? "");
		setLabName(exam.labName ?? "");
		setRequestId(exam.requestId ?? "");
	}, [exam.id]);

	const pendingCount = rows.filter((r) => r.pendingReview).length;

	const save = async (status?: "draft" | "confirmed") => {
		try {
			await update.mutateAsync({
				examId: exam.id,
				performedAt: performedAt || null,
				labName: labName || null,
				requestId: requestId || null,
				status,
				metrics: rows,
			});
			toast.success(status === "confirmed" ? "Exam confirmed" : "Saved");
			if (status === "confirmed") onConfirmed?.();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const remove = async () => {
		if (!window.confirm("Delete this exam? Metrics will be removed.")) return;
		try {
			await del.mutateAsync(exam.id);
			toast.success("Exam deleted");
			onDeleted?.();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex flex-wrap items-center justify-between gap-2">
					<span className="flex items-center gap-2">
						Review exam
						<Badge
							variant={exam.status === "confirmed" ? "default" : "outline"}
						>
							{exam.status}
						</Badge>
						{pendingCount > 0 ? (
							<Badge variant="outline" className="gap-1">
								<AlertTriangle className="w-3 h-3" />
								{pendingCount} to review
							</Badge>
						) : null}
					</span>
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="ghost"
							onClick={remove}
							disabled={del.isPending}
						>
							<Trash2 className="w-3 h-3" /> Delete
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => save("draft")}
							disabled={update.isPending}
						>
							Save draft
						</Button>
						<Button
							size="sm"
							onClick={() => save("confirmed")}
							disabled={update.isPending}
						>
							{exam.status === "confirmed" ? "Save" : "Confirm"}
						</Button>
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
					<div>
						<label className="text-[10px] uppercase tracking-wider text-muted-foreground">
							Performed at
						</label>
						<Input
							type="date"
							value={performedAt.slice(0, 10)}
							onChange={(e) => setPerformedAt(e.target.value)}
						/>
					</div>
					<div>
						<label className="text-[10px] uppercase tracking-wider text-muted-foreground">
							Lab
						</label>
						<Input
							value={labName}
							placeholder="e.g. IEMEV Botafogo"
							onChange={(e) => setLabName(e.target.value)}
						/>
					</div>
					<div>
						<label className="text-[10px] uppercase tracking-wider text-muted-foreground">
							Request ID
						</label>
						<Input
							value={requestId}
							placeholder="e.g. 127.819"
							onChange={(e) => setRequestId(e.target.value)}
						/>
					</div>
				</div>

				<div className="flex items-center justify-between">
					<div className="text-xs uppercase tracking-wider text-muted-foreground">
						Metrics ({rows.length})
					</div>
					<Button
						size="sm"
						variant="outline"
						onClick={() =>
							setRows((p) => [
								...p,
								{
									canonicalKey: null,
									displayName: "",
									status: "unknown",
									pendingReview: false,
								},
							])
						}
					>
						<Plus className="w-3 h-3" /> Add metric
					</Button>
				</div>

				{rows.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No metrics extracted. Add one manually or re-upload.
					</p>
				) : (
					<div className="space-y-2">
						{rows.map((m, idx) => (
							<MetricRow
								// biome-ignore lint/suspicious/noArrayIndexKey: list is fully controlled
								key={idx}
								metric={m}
								onChange={(patch) =>
									setRows((prev) =>
										prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)),
									)
								}
								onRemove={() =>
									setRows((prev) => prev.filter((_, i) => i !== idx))
								}
							/>
						))}
					</div>
				)}

				{exam.rawAiText ? (
					<details className="text-xs text-muted-foreground">
						<summary className="cursor-pointer">Raw AI output</summary>
						<pre className="whitespace-pre-wrap mt-2 max-h-64 overflow-auto">
							{exam.rawAiText}
						</pre>
					</details>
				) : null}
			</CardContent>
		</Card>
	);
}

function MetricRow({
	metric,
	onChange,
	onRemove,
}: {
	metric: ExamMetricInput;
	onChange: (patch: Partial<ExamMetricInput>) => void;
	onRemove: () => void;
}) {
	const knownKey =
		metric.canonicalKey && TAXONOMY_BY_KEY[metric.canonicalKey]
			? metric.canonicalKey
			: null;
	return (
		<div
			className={`rounded-md border p-3 space-y-2 ${
				metric.pendingReview ? "border-amber-400/60 bg-amber-50/30" : ""
			}`}
		>
			<div className="flex flex-wrap items-center gap-2">
				<Input
					value={metric.displayName}
					placeholder="Display name (e.g. TGP)"
					onChange={(e) => onChange({ displayName: e.target.value })}
					className="flex-1 min-w-[160px]"
				/>
				<Input
					type="number"
					step="any"
					value={metric.valueNum ?? ""}
					placeholder="value"
					onChange={(e) =>
						onChange({
							valueNum:
								e.target.value === "" ? null : Number(e.target.value),
						})
					}
					className="w-24"
				/>
				<Input
					value={metric.unit ?? ""}
					placeholder="unit"
					onChange={(e) => onChange({ unit: e.target.value || null })}
					className="w-24"
				/>
				<Button size="icon" variant="ghost" onClick={onRemove}>
					<Trash2 className="w-3 h-3" />
				</Button>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<div className="flex items-center gap-1">
					<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Ref:
					</span>
					<Input
						type="number"
						step="any"
						value={metric.refLow ?? ""}
						placeholder="low"
						onChange={(e) =>
							onChange({
								refLow:
									e.target.value === "" ? null : Number(e.target.value),
							})
						}
						className="w-20 h-8"
					/>
					<span className="text-muted-foreground">–</span>
					<Input
						type="number"
						step="any"
						value={metric.refHigh ?? ""}
						placeholder="high"
						onChange={(e) =>
							onChange({
								refHigh:
									e.target.value === "" ? null : Number(e.target.value),
							})
						}
						className="w-20 h-8"
					/>
				</div>
				<Select
					value={metric.status ?? "unknown"}
					onValueChange={(v) => onChange({ status: v as MetricStatus })}
				>
					<SelectTrigger className="w-32 h-8">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{STATUS_OPTIONS.map((s) => (
							<SelectItem key={s} value={s}>
								<Badge variant={statusVariant(s)} className="capitalize">
									{s}
								</Badge>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={knownKey ?? "__proposed__"}
					onValueChange={(v) => {
						if (v === "__proposed__") {
							onChange({ pendingReview: true });
							return;
						}
						onChange({ canonicalKey: v, pendingReview: false });
					}}
				>
					<SelectTrigger className="w-56 h-8">
						<SelectValue placeholder="Map to canonical…" />
					</SelectTrigger>
					<SelectContent>
						{metric.pendingReview && metric.canonicalKey ? (
							<SelectItem value="__proposed__">
								<span className="text-amber-700">
									Keep proposed: {metric.canonicalKey}
								</span>
							</SelectItem>
						) : null}
						{Object.entries(
							LAB_TAXONOMY.reduce<Record<string, typeof LAB_TAXONOMY>>(
								(acc, m) => {
									(acc[m.panel] ??= []).push(m);
									return acc;
								},
								{},
							),
						).map(([panel, mets]) => (
							<div key={panel}>
								<div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
									{PANEL_LABEL[panel as keyof typeof PANEL_LABEL]}
								</div>
								{mets.map((m) => (
									<SelectItem key={m.key} value={m.key}>
										{m.label}{" "}
										<span className="text-muted-foreground">({m.unit})</span>
									</SelectItem>
								))}
							</div>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
