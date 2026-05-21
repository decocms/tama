import {
	AlarmClock,
	Check,
	ChevronDown,
	ChevronRight,
	Loader2,
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

type GroupKey = "overdue" | "later" | "earlier" | "tomorrow";

interface PendingRow {
	kind: "pending";
	key: string;
	entry: TimetableEntry;
	// True for pending entries within the COMING_UP_MS window (default 3h).
	// Multiple rows can be flagged at once — they all get the "Coming up"
	// highlight + upcoming tint. Replaces the older single-row "Next" badge.
	comingSoon?: boolean;
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
// "Closer than this is COMING UP" — any pending entry within this many ms of
// now (and not yet overdue) gets the highlighted tint + "Coming up" badge.
const COMING_UP_MS = 3 * 60 * 60 * 1000;

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
	// today (Later today — the primary action group, rendered first), and
	// the next calendar day (Tomorrow — collapsed by default since it's a
	// heads-up rather than something the user has to act on now). Within
	// Later today, anything within COMING_UP_MS is flagged comingSoon so
	// it gets the upcoming tint + "Coming up" badge.
	for (const e of entries) {
		if (e.status !== "pending") continue;
		const t = new Date(e.scheduledAt).getTime();
		const delta = t - now;
		const row: PendingRow = {
			kind: "pending",
			key: `pending-${e.id}`,
			entry: e,
			comingSoon: delta >= 0 && delta <= COMING_UP_MS,
		};
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
	// Ascending across every group — same direction throughout the page so
	// the eye reads morning → evening regardless of which bucket you're in.
	earlier.sort(
		(a, b) => new Date(a.actualAt).getTime() - new Date(b.actualAt).getTime(),
	);

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
	// Per-row pending tracking so clicking Give on one row only spins that
	// button, not every Give in the list (mutation hook is shared).
	const [pendingId, setPendingId] = useState<string | null>(null);

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(id);
	}, []);

	const groups = useMemo(
		() => buildGroups(entries, doses, now),
		[entries, doses, now],
	);

	const give = (e: TimetableEntry) => {
		setPendingId(e.id);
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
				onSettled: () => setPendingId(null),
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

			{/* Order:
			    1. Later today — the primary action group (anything coming up in
			       the next 3h is visually highlighted as "Coming up").
			    2. Overdue — past-due, still unlogged. Action needed, but
			       secondary to upcoming.
			    3. Earlier today — given/skipped doses already recorded today.
			    4. Tomorrow — heads-up only, collapsed by default. */}
			<Group
				groupKey="later"
				label="Later today"
				rows={groups.later}
				now={now}
				onGive={give}
				pending={log.isPending}
				pendingId={pendingId}
			/>
			<Group
				groupKey="overdue"
				label="Overdue"
				rows={groups.overdue}
				now={now}
				onGive={give}
				pending={log.isPending}
				pendingId={pendingId}
			/>
			<Group
				groupKey="earlier"
				label="Given"
				rows={groups.earlier}
				now={now}
			/>
			<Group
				groupKey="tomorrow"
				label="Tomorrow"
				rows={groups.tomorrow}
				now={now}
				onGive={give}
				pending={log.isPending}
				pendingId={pendingId}
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
	pendingId,
	collapsedByDefault,
}: {
	groupKey: GroupKey;
	label: string;
	rows: Row[];
	now: number;
	onGive?: (e: TimetableEntry) => void;
	pending?: boolean;
	pendingId?: string | null;
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
				<ul className="grid gap-2.5">
					{rows.map((r) =>
						r.kind === "pending" ? (
							<PendingRowView
								key={r.key}
								entry={r.entry}
								now={now}
								onGive={() => onGive?.(r.entry)}
								pending={!!pending}
								isThisRowPending={pendingId === r.entry.id}
								overdue={groupKey === "overdue"}
								comingSoon={!!r.comingSoon}
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
	isThisRowPending,
	overdue,
	comingSoon,
}: {
	entry: TimetableEntry;
	now: number;
	onGive: () => void;
	pending: boolean;
	isThisRowPending: boolean;
	overdue: boolean;
	comingSoon: boolean;
}) {
	const adjusted = entry.notes?.includes("adjusted");
	const isMeal = entry.kind === "meal";
	return (
		<li
			className={cn(
				// Flat physical card: tinted background + 4px colored left edge.
				// No shadow — multiple shadows stacked tightly read as horizontal
				// lines and ruin the clean look.
				"relative rounded-xl border-l-4 flex items-center gap-3.5 pl-3.5 pr-3 py-3.5",
				isMeal
					? "border-l-[var(--color-accent-meal)]/80"
					: "border-l-[var(--color-accent-med)]/80",
				overdue
					? "bg-[var(--color-tint-overdue)]"
					: comingSoon
						? "bg-[var(--color-tint-upcoming)]"
						: "bg-secondary/45",
			)}
		>
			<TimeTile
				iso={entry.scheduledAt}
				tone={overdue ? "overdue" : comingSoon ? "upcoming" : "default"}
			/>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-1.5">
					<span className="font-display font-semibold truncate text-base">
						{entry.itemName}
					</span>
					{comingSoon ? (
						<Badge
							variant="outline"
							className="text-[9px] py-0 px-1 h-3.5 border-[var(--color-status-upcoming)]/45 text-[var(--color-status-upcoming)] uppercase tracking-wider shrink-0"
						>
							Coming up
						</Badge>
					) : null}
				</div>
				<div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap mt-0.5">
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
				className="shrink-0 h-9 px-3.5 font-semibold"
			>
				{isThisRowPending ? (
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
				) : (
					<Check className="w-3.5 h-3.5" />
				)}
				{isThisRowPending ? "Logging…" : "Give"}
			</Button>
		</li>
	);
}

/**
 * Chunky time tile — replaces the inline TimeColumn for timetable rows so
 * each entry feels like a physical scheduling card. The time is the
 * anchor; everything else hangs off it.
 */
function TimeTile({
	iso,
	tone,
}: {
	iso: string;
	tone: "default" | "overdue" | "upcoming" | "given" | "muted";
}) {
	const toneStyle =
		tone === "overdue"
			? "bg-[var(--color-status-overdue)]/10 text-[var(--color-status-overdue)]"
			: tone === "upcoming"
				? "bg-[var(--color-status-upcoming)]/10 text-[var(--color-status-upcoming)]"
				: tone === "given"
					? "bg-[var(--color-status-given)]/10 text-[var(--color-status-given)]"
					: tone === "muted"
						? "bg-muted/40 text-muted-foreground"
						: "bg-muted/40 text-foreground";
	return (
		<div
			className={cn(
				"shrink-0 w-14 h-14 rounded-lg flex items-center justify-center font-time text-base font-semibold",
				toneStyle,
			)}
		>
			{formatTime(iso)}
		</div>
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
				"relative rounded-xl border-l-4 flex items-center gap-3.5 pl-3.5 pr-3 py-3.5 opacity-90",
				isMeal
					? "border-l-[var(--color-accent-meal)]/45"
					: "border-l-[var(--color-accent-med)]/45",
				"bg-[var(--color-tint-given)]",
			)}
		>
			<TimeTile iso={row.actualAt} tone={isSkipped ? "muted" : "given"} />
			<div className="flex-1 min-w-0">
				<div className="font-display font-semibold truncate text-base">
					{row.itemName}
				</div>
				{showDelta ? (
					<div className="text-xs text-muted-foreground truncate mt-0.5">
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
