import { Check, History, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog.tsx";
import { formatDate, formatTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import type { Dose } from "@/types/api.ts";
import { TimeColumn } from "./TimeColumn.tsx";

/**
 * Self-contained "History (N)" trigger + modal. Rendered in the Timetable
 * section header so the action sits on the same row as the title.
 */
// Adjustment-only doses (snooze, timetable_adjust) shouldn't clutter the
// dose-history modal — they're plumbing for the schedule, not real doses.
function isAdjustmentMarker(d: Dose): boolean {
	if (!d.note) return false;
	if (d.note === "schedule-adjustment" || d.note === "schedule adjustment only")
		return true;
	return d.note.startsWith("snoozed ");
}

export function DoseHistoryButton({ doses }: { doses: Dose[] }) {
	const [open, setOpen] = useState(false);
	const visible = doses.filter(
		(d) => d.status !== "undone" && !isAdjustmentMarker(d),
	);
	const totalDoses = visible.length;

	const sorted = useMemo(
		() =>
			visible
				.slice()
				.sort(
					(a, b) =>
						new Date(b.actualAt).getTime() - new Date(a.actualAt).getTime(),
				),
		[visible],
	);

	return (
		<>
			<Button
				size="sm"
				variant="ghost"
				onClick={() => setOpen(true)}
				className="text-xs"
				aria-label={`History (${totalDoses})`}
				title={`History (${totalDoses})`}
			>
				<History className="w-3.5 h-3.5" />
				{/* Section header is shared with RemindersToggle — collapse the
				    text label below sm so both icons stay visible on phones. */}
				<span className="hidden sm:inline">History ({totalDoses})</span>
				<span className="sm:hidden">{totalDoses}</span>
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="font-display">Dose history</DialogTitle>
					</DialogHeader>
					{sorted.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No doses logged yet.
						</p>
					) : (
						<ul className="divide-y">
							{sorted.map((d) => {
								const delta = d.plannedAt
									? Math.round(
											(new Date(d.actualAt).getTime() -
												new Date(d.plannedAt).getTime()) /
												60000,
										)
									: null;
								const onTime = delta === null || Math.abs(delta) < 15;
								return (
									<li key={d.id} className="py-2.5 text-sm">
										<div className="flex items-center justify-between gap-2">
											<div className="flex items-center gap-2 min-w-0">
												<TimeColumn iso={d.actualAt} size="sm" tone="muted" />
												<span className="font-medium truncate">
													{d.itemName}
												</span>
											</div>
											<StatusPill status={d.status} onTime={onTime} />
										</div>
										<div className="text-xs text-muted-foreground mt-0.5">
											{formatDate(d.actualAt)}
											{d.plannedAt
												? ` · planned ${formatTime(d.plannedAt)}${
														delta !== null && Math.abs(delta) >= 5
															? ` (${delta > 0 ? "late" : "early"} ${formatDelta(Math.abs(delta))})`
															: ""
													}`
												: ""}
										</div>
										{d.note ? (
											<div className="text-xs italic text-muted-foreground mt-0.5">
												{d.note}
											</div>
										) : null}
									</li>
								);
							})}
						</ul>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}

function formatDelta(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function StatusPill({
	status,
	onTime,
}: {
	status: "given" | "skipped" | "undone";
	onTime: boolean;
}) {
	if (status === "given") {
		return (
			<Badge
				variant="outline"
				className={cn(
					"text-xs",
					onTime
						? "border-[var(--color-status-given)]/30 text-[var(--color-status-given)]"
						: "border-amber-500/30 text-amber-700 dark:text-amber-300",
				)}
			>
				<Check className="w-3 h-3" />
				{onTime ? "Given" : "Given (off-schedule)"}
			</Badge>
		);
	}
	if (status === "skipped") {
		return (
			<Badge variant="outline" className="text-xs">
				<X className="w-3 h-3" />
				Skipped
			</Badge>
		);
	}
	return (
		<Badge variant="outline" className="text-xs">
			Undone
		</Badge>
	);
}
