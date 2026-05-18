import {
	AlarmClock,
	Check,
	ChevronDown,
	ChevronRight,
	Pill,
	Utensils,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { formatTime, relativeTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import type { Dose, TimetableEntry } from "@/types/api.ts";
import { useLogDose } from "../lib/queries.ts";
import { TimeColumn } from "./TimeColumn.tsx";

type GroupKey = "overdue" | "later" | "earlier" | "tomorrow";

interface PendingRow {
	kind: "pending";
	key: string;
	entry: TimetableEntry;
	// Marks the single soonest pending entry in the day — gets a "Next" badge
	// in the rendered row so users can spot it without a dedicated group.
	isNext?: boolean;
}

interface GivenRow {
	kind: "given";
	key: string;
	itemName: string;
	itemKind: "medication" | "meal";
	actualAt: string;
	plannedAt: string | null;
	status: "given" | "skipped";
	dose: Dose;
}

type Row = PendingRow | GivenRow;

const OVERDUE_GRACE_MS = 12 * 60 * 60 * 1000;

interface Groups {
	overdue: PendingRow[];
	later: PendingRow[];
	earlier: GivenRow[];
	tomorrow: PendingRow[];
}

// Adjustment-only doses (snooze, timetable_adjust) carry a schedule shift but
// the user didn't actually administer anything — don't surface them as
// completed events in the Earlier-today list.
function isAdjustmentMarker(d: Dose): boolean {
	if (!d.note) return false;
	if (d.note === "schedule-adjustment" || d.note === "schedule adjustment only")
		return true;
	return d.note.startsWith("snoozed ");
}

function buildGroups(
	entries: TimetableEntry[],
	doses: Dose[],
	now: number,
): Groups {
	// Last given dose per item.
	const lastGivenByItem = new Map<string, Dose>();
	for (const d of doses) {
		if (d.status === "undone") continue;
		if (isAdjustmentMarker(d)) continue;
		const k = d.itemName.toLowerCase();
		const prev = lastGivenByItem.get(k);
		if (!prev || new Date(d.actualAt) > new Date(prev.actualAt)) {
			lastGivenByItem.set(k, d);
		}
	}

	// Track which item names appear in any entry — so we only show "earlier"
	// for items we still recognize (drops orphans from deleted prescriptions).
	const knownItems = new Set<string>();
	const itemKinds = new Map<string, "medication" | "meal">();
	for (const e of entries) {
		knownItems.add(e.itemName.toLowerCase());
		itemKinds.set(e.itemName.toLowerCase(), e.kind);
	}

	const overdue: PendingRow[] = [];
	const later: PendingRow[] = [];
	const tomorrow: PendingRow[] = [];
	const tomorrowMs = now + 24 * 60 * 60 * 1000;

	// Three pending buckets: still-pending past-due (Overdue), the rest of
	// today (Later today), and the next calendar day (Tomorrow — collapsed
	// by default since it's a heads-up rather than something the user has
	// to act on now). The soonest entry in Later gets `isNext` and the
	// NowStrip above also surfaces it with action buttons.
	for (const e of entries) {
		if (e.status !== "pending") continue;
		const t = new Date(e.scheduledAt).getTime();
		const row: PendingRow = {
			kind: "pending",
			key: `pending-${e.id}`,
			entry: e,
		};
		const delta = t - now;
		if (delta < 0) {
			if (delta >= -OVERDUE_GRACE_MS) overdue.push(row);
			// else: silently drop very-stale pending entries
		} else if (isSameDay(t, now)) {
			later.push(row);
		} else if (isSameDay(t, tomorrowMs)) {
			tomorrow.push(row);
		}
	}

	// Earlier today: a single row per item showing its most-recent given/skipped.
	const earlier: GivenRow[] = [];
	const seenItems = new Set<string>();
	for (const d of doses) {
		if (d.status === "undone") continue;
		const k = d.itemName.toLowerCase();
		if (!knownItems.has(k)) continue;
		if (seenItems.has(k)) continue;
		const t = new Date(d.actualAt).getTime();
		if (!isSameDay(t, now)) continue;
		// only the latest for each item — but we walked doses in unspecified order.
		// So compute latest explicitly:
		const latest = lastGivenByItem.get(k);
		if (!latest) continue;
		if (!isSameDay(new Date(latest.actualAt).getTime(), now)) continue;
		seenItems.add(k);
		earlier.push({
			kind: "given",
			key: `given-${latest.id}`,
			itemName: latest.itemName,
			itemKind: (itemKinds.get(k) ?? latest.kind) as "medication" | "meal",
			actualAt: latest.actualAt,
			plannedAt: latest.plannedAt,
			status: latest.status === "skipped" ? "skipped" : "given",
			dose: latest,
		});
	}

	overdue.sort(byScheduled);
	later.sort(byScheduled);
	tomorrow.sort(byScheduled);
	earlier.sort(
		(a, b) => new Date(b.actualAt).getTime() - new Date(a.actualAt).getTime(),
	);

	if (later[0]) later[0].isNext = true;

	return { overdue, later, earlier, tomorrow };
}

function byScheduled(a: PendingRow, b: PendingRow): number {
	return (
		new Date(a.entry.scheduledAt).getTime() -
		new Date(b.entry.scheduledAt).getTime()
	);
}

function isSameDay(a: number, b: number): boolean {
	const da = new Date(a);
	const db = new Date(b);
	return (
		da.getFullYear() === db.getFullYear() &&
		da.getMonth() === db.getMonth() &&
		da.getDate() === db.getDate()
	);
}

export function Timetable({
	episodeId,
	entries,
	doses,
}: {
	episodeId: string;
	entries: TimetableEntry[];
	doses: Dose[];
}) {
	const log = useLogDose(episodeId);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(id);
	}, []);

	const groups = useMemo(
		() => buildGroups(entries, doses, now),
		[entries, doses, now],
	);

	const give = (e: TimetableEntry) => {
		log.mutate(
			{
				itemName: e.itemName,
				kind: e.kind,
				plannedAt: e.scheduledAt,
				actualAt: new Date().toISOString(),
				status: "given",
			},
			{
				onSuccess: () => toast.success(`${e.itemName} logged`),
				onError: (err) => toast.error((err as Error).message),
			},
		);
	};

	const hasAnything =
		groups.overdue.length +
			groups.later.length +
			groups.earlier.length +
			groups.tomorrow.length >
		0;

	if (entries.length === 0) {
		return (
			<EmptyCard>
				No scheduled items yet. Upload a confirmed prescription to populate the
				timetable.
			</EmptyCard>
		);
	}

	return (
		<div className="space-y-3">
			{!hasAnything ? (
				<EmptyCard>Nothing scheduled or given today.</EmptyCard>
			) : null}

			<Group
				groupKey="overdue"
				label="Overdue"
				rows={groups.overdue}
				now={now}
				onGive={give}
				pending={log.isPending}
			/>
			<Group
				groupKey="earlier"
				label="Earlier today"
				rows={groups.earlier}
				now={now}
			/>
			<Group
				groupKey="later"
				label="Later today"
				rows={groups.later}
				now={now}
				onGive={give}
				pending={log.isPending}
			/>
			<Group
				groupKey="tomorrow"
				label="Tomorrow"
				rows={groups.tomorrow}
				now={now}
				onGive={give}
				pending={log.isPending}
				collapsedByDefault
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------

const GROUP_STYLE: Record<GroupKey, { dot: string; label: string }> = {
	overdue: {
		dot: "bg-[var(--color-status-overdue)]",
		label: "text-[var(--color-status-overdue)]",
	},
	later: {
		dot: "bg-[var(--color-status-pending)]",
		label: "text-muted-foreground",
	},
	earlier: {
		dot: "bg-[var(--color-status-given)]",
		label: "text-[var(--color-status-given)]",
	},
	tomorrow: {
		dot: "bg-muted-foreground/40",
		label: "text-muted-foreground",
	},
};

function Group({
	groupKey,
	label,
	rows,
	now,
	onGive,
	pending,
	collapsedByDefault,
}: {
	groupKey: GroupKey;
	label: string;
	rows: Row[];
	now: number;
	onGive?: (e: TimetableEntry) => void;
	pending?: boolean;
	collapsedByDefault?: boolean;
}) {
	const [open, setOpen] = useState(!collapsedByDefault);
	if (rows.length === 0) return null;

	const style = GROUP_STYLE[groupKey];

	return (
		<div className="space-y-1.5">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="w-full flex items-center gap-2 px-1 py-1 text-left hover:opacity-80"
			>
				<span
					className={cn("inline-block w-1.5 h-1.5 rounded-full", style.dot)}
				/>
				<span
					className={cn(
						"text-[10px] uppercase tracking-[0.14em] font-semibold",
						style.label,
					)}
				>
					{label}
				</span>
				<span className="text-xs text-muted-foreground">{rows.length}</span>
				<span className="ml-auto text-muted-foreground">
					{open ? (
						<ChevronDown className="w-3.5 h-3.5" />
					) : (
						<ChevronRight className="w-3.5 h-3.5" />
					)}
				</span>
			</button>
			{open ? (
				<ul
					className={cn(
						"rounded-lg border divide-y overflow-hidden",
						groupKey === "overdue" ? "bg-[var(--color-tint-overdue)]" : "",
						groupKey === "earlier" ? "bg-[var(--color-tint-given)]" : "",
					)}
				>
					{rows.map((r) =>
						r.kind === "pending" ? (
							<PendingRowView
								key={r.key}
								entry={r.entry}
								now={now}
								onGive={() => onGive?.(r.entry)}
								pending={!!pending}
								overdue={groupKey === "overdue"}
								isNext={!!r.isNext}
							/>
						) : (
							<GivenRowView key={r.key} row={r} />
						),
					)}
				</ul>
			) : null}
		</div>
	);
}

function PendingRowView({
	entry,
	now,
	onGive,
	pending,
	overdue,
	isNext,
}: {
	entry: TimetableEntry;
	now: number;
	onGive: () => void;
	pending: boolean;
	overdue: boolean;
	isNext: boolean;
}) {
	const adjusted = entry.notes?.includes("adjusted");
	const isMeal = entry.kind === "meal";
	return (
		<li
			className={cn(
				// 3px colored left stripe replaces the previous round pill icon —
				// gives the same med vs meal signal in almost no horizontal space.
				"relative flex items-center gap-2.5 pl-3 pr-2.5 py-2.5",
				"border-l-[3px]",
				isMeal
					? "border-l-[var(--color-accent-meal)]/70"
					: "border-l-[var(--color-accent-med)]/70",
				isNext ? "bg-[var(--color-tint-upcoming)]" : "",
			)}
		>
			<TimeColumn
				iso={entry.scheduledAt}
				size="md"
				tone={overdue ? "overdue" : isNext ? "upcoming" : "default"}
				className="w-11 shrink-0 font-semibold"
			/>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-1.5">
					<span className="font-semibold truncate">{entry.itemName}</span>
					{isNext ? (
						<Badge
							variant="outline"
							className="text-[9px] py-0 px-1 h-3.5 border-[var(--color-status-upcoming)]/45 text-[var(--color-status-upcoming)] uppercase tracking-wider shrink-0"
						>
							Next
						</Badge>
					) : null}
				</div>
				<div className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap mt-0.5">
					<span>{relativeTime(entry.scheduledAt, now)}</span>
					{entry.dosage ? (
						<>
							<span aria-hidden>·</span>
							<span className="truncate">{entry.dosage}</span>
						</>
					) : null}
					{adjusted ? (
						<Badge
							variant="outline"
							className="text-[9px] py-0 px-1 h-3.5 border-amber-500/30 text-amber-700 dark:text-amber-300 shrink-0"
						>
							<AlarmClock className="w-2.5 h-2.5" />
							adjusted
						</Badge>
					) : null}
				</div>
			</div>
			<Button
				size="sm"
				onClick={onGive}
				disabled={pending}
				className="shrink-0 h-8 px-3"
			>
				<Check className="w-3.5 h-3.5" />
				Give
			</Button>
		</li>
	);
}

function GivenRowView({ row }: { row: GivenRow }) {
	const delta = row.plannedAt
		? Math.round(
				(new Date(row.actualAt).getTime() - new Date(row.plannedAt).getTime()) /
					60000,
			)
		: 0;
	const showDelta = row.plannedAt && Math.abs(delta) >= 5;
	const isSkipped = row.status === "skipped";
	const isMeal = row.itemKind === "meal";
	return (
		<li
			className={cn(
				"relative flex items-center gap-2.5 pl-3 pr-2.5 py-2.5 opacity-80",
				"border-l-[3px]",
				isMeal
					? "border-l-[var(--color-accent-meal)]/40"
					: "border-l-[var(--color-accent-med)]/40",
			)}
		>
			<TimeColumn
				iso={row.actualAt}
				size="md"
				tone={isSkipped ? "muted" : "given"}
				className="w-11 shrink-0 font-semibold"
			/>
			<div className="flex-1 min-w-0">
				<div className="font-semibold truncate">{row.itemName}</div>
				{showDelta ? (
					<div className="text-[11px] text-muted-foreground truncate mt-0.5">
						Planned {formatTime(row.plannedAt as string)} ·{" "}
						{delta > 0 ? "late" : "early"} {formatDelta(Math.abs(delta))}
					</div>
				) : null}
			</div>
			{isSkipped ? (
				<Badge variant="outline" className="text-[10px] shrink-0">
					Skipped
				</Badge>
			) : (
				<Badge
					variant="outline"
					className="text-[10px] shrink-0 border-[var(--color-status-given)]/30 text-[var(--color-status-given)]"
				>
					<Check className="w-3 h-3" />
					Given
				</Badge>
			)}
		</li>
	);
}

function formatDelta(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function EmptyCard({ children }: { children: React.ReactNode }) {
	return (
		<div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground bg-secondary/40">
			{children}
		</div>
	);
}
