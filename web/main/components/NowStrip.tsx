import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Pill, Utensils } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { formatTime, relativeTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import type { TimetableEntry } from "@/types/api.ts";
import { useLogDose, useSnoozeItem } from "../lib/queries.ts";
import { TimeColumn } from "./TimeColumn.tsx";

interface Candidate {
	episodeId: string;
	episodeTitle?: string;
	petName?: string;
	entry: TimetableEntry;
}

const SOON_MS = 2 * 60 * 60 * 1000; // surface anything in the next 2h or overdue
const OVERDUE_GRACE_MS = 6 * 60 * 60 * 1000; // ignore old pending entries >6h late

function pickImminent(candidates: Candidate[], now: number): Candidate | null {
	const eligible = candidates
		.filter((c) => c.entry.status === "pending")
		.filter((c) => {
			const t = new Date(c.entry.scheduledAt).getTime();
			const delta = t - now;
			return delta <= SOON_MS && delta >= -OVERDUE_GRACE_MS;
		})
		.sort(
			(a, b) =>
				new Date(a.entry.scheduledAt).getTime() -
				new Date(b.entry.scheduledAt).getTime(),
		);
	return eligible[0] ?? null;
}

/**
 * Compact vertical card for the most-imminent pending dose. Designed to fit
 * both a narrow column (1/3 width on episode page) and a full-width slot on
 * the home page. Pulses on overdue.
 *
 * When there's no near-term action: returns null by default (used on Home,
 * where we don't want an empty card cluttering the layout) or — when
 * `renderIdle` is true — renders a calm "All caught up" tile so a fixed-
 * width grid slot stays filled.
 */
export function NowStrip({
	candidates,
	showEpisodeLink = false,
	renderIdle = false,
}: {
	candidates: Candidate[];
	showEpisodeLink?: boolean;
	renderIdle?: boolean;
}) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(id);
	}, []);

	const pick = pickImminent(candidates, now);
	const log = useLogDose(pick?.episodeId ?? "");
	const snooze = useSnoozeItem(pick?.episodeId ?? "");

	if (!pick) {
		if (!renderIdle) return null;
		return <IdleTile candidates={candidates} now={now} />;
	}

	const target = new Date(pick.entry.scheduledAt).getTime();
	const isOverdue = target < now;
	const isMeal = pick.entry.kind === "meal";

	const handleGive = () => {
		log.mutate(
			{
				itemName: pick.entry.itemName,
				kind: pick.entry.kind,
				plannedAt: pick.entry.scheduledAt,
				actualAt: new Date().toISOString(),
				status: "given",
			},
			{
				onSuccess: () => toast.success(`${pick.entry.itemName} logged`),
				onError: (e) => toast.error((e as Error).message),
			},
		);
	};

	// Smart snooze: the new scheduledAt should land at least 15 minutes in
	// the future from NOW, not just +15m from the original slot. Otherwise an
	// overdue dose (e.g. 19m late) would snooze to a still-past time. Rounded
	// up to the next 5-minute boundary for tidier numbers in the button label
	// and toast.
	const SNOOZE_AHEAD_MS = 15 * 60_000;
	const ROUND_MS = 5 * 60_000;
	const targetScheduledMs = Math.max(
		now + SNOOZE_AHEAD_MS,
		target + SNOOZE_AHEAD_MS,
	);
	const rawShiftMs = targetScheduledMs - target;
	const shiftMs = Math.ceil(rawShiftMs / ROUND_MS) * ROUND_MS;
	const shiftMinutes = shiftMs / 60_000;
	const shiftHours = shiftMs / (60 * 60_000);

	const handleSnooze = () => {
		// Snooze shifts the item's schedule anchor — no fake dose row. The
		// shift cascades to all future occurrences until the next real dose
		// log resets the anchor.
		snooze.mutate(
			{
				itemName: pick.entry.itemName,
				hours: shiftHours,
			},
			{
				onSuccess: () =>
					toast(`Snoozed ${pick.entry.itemName} ${shiftMinutes}m`),
				onError: (e) => toast.error((e as Error).message),
			},
		);
	};

	return (
		<div
			className={cn(
				"relative h-full rounded-2xl surface p-4 flex flex-col gap-3",
				isOverdue
					? "bg-[var(--color-tint-overdue)]"
					: "bg-[var(--color-tint-upcoming)]",
				isOverdue ? "animate-overdue-pulse" : "",
			)}
		>
			<div className="flex items-center gap-2 flex-wrap">
				<div
					className={cn(
						"shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
						isOverdue
							? "bg-[var(--color-status-overdue)]/15 text-[var(--color-status-overdue)]"
							: "bg-[var(--color-status-upcoming)]/15 text-[var(--color-status-upcoming)]",
					)}
					aria-hidden
				>
					{isMeal ? (
						<Utensils className="w-3.5 h-3.5" />
					) : (
						<Pill className="w-3.5 h-3.5" />
					)}
				</div>
				<span
					className={cn(
						"text-[10px] uppercase tracking-[0.14em] font-semibold",
						isOverdue
							? "text-[var(--color-status-overdue)]"
							: "text-[var(--color-status-upcoming)]",
					)}
				>
					{isOverdue ? "Overdue" : "Next up"}
				</span>
				{pick.petName ? (
					<>
						<span className="text-[10px] text-muted-foreground" aria-hidden>
							·
						</span>
						<span className="text-xs font-medium truncate">{pick.petName}</span>
					</>
				) : null}
				{showEpisodeLink && pick.episodeTitle ? (
					<Link
						to="/episode/$episodeId"
						params={{ episodeId: pick.episodeId }}
						className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 ml-auto truncate"
					>
						{pick.episodeTitle}
						<ArrowRight className="w-3 h-3 shrink-0" />
					</Link>
				) : null}
			</div>

			<div className="min-w-0">
				<div className="font-display text-xl sm:text-2xl font-semibold leading-tight truncate">
					{pick.entry.itemName}
				</div>
				<div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
					<TimeColumn
						iso={pick.entry.scheduledAt}
						size="lg"
						tone={isOverdue ? "overdue" : "upcoming"}
					/>
					<span
						className={cn(
							"text-sm font-medium",
							isOverdue
								? "text-[var(--color-status-overdue)]"
								: "text-muted-foreground",
						)}
					>
						{relativeTime(pick.entry.scheduledAt, now)}
					</span>
				</div>
				{pick.entry.dosage ? (
					<div className="text-xs text-muted-foreground mt-0.5 truncate">
						{pick.entry.dosage}
						{pick.entry.route ? ` · ${pick.entry.route}` : ""}
					</div>
				) : null}
			</div>

			<div className="flex gap-2 mt-auto">
				<Button
					size="sm"
					onClick={handleGive}
					disabled={log.isPending}
					className="font-semibold flex-1"
				>
					<Check className="w-4 h-4" />
					Give now
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={handleSnooze}
					disabled={log.isPending}
				>
					Snooze {shiftMinutes}m
				</Button>
			</div>
		</div>
	);
}

function IdleTile({
	candidates,
	now,
}: {
	candidates: Candidate[];
	now: number;
}) {
	// Find the next pending entry beyond the SOON window — gives the user a
	// gentle "next up at HH:mm" hint even when nothing's imminent.
	const next = candidates
		.filter((c) => c.entry.status === "pending")
		.filter((c) => new Date(c.entry.scheduledAt).getTime() > now)
		.sort(
			(a, b) =>
				new Date(a.entry.scheduledAt).getTime() -
				new Date(b.entry.scheduledAt).getTime(),
		)[0];

	return (
		<div className="h-full rounded-2xl surface bg-secondary/30 p-4 flex flex-col gap-2 justify-center text-center">
			<div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
				All caught up
			</div>
			{next ? (
				<div className="text-sm text-foreground/80">
					Next: <span className="font-medium">{next.entry.itemName}</span>
					<span className="text-muted-foreground"> · </span>
					<span className="font-time">
						{formatTime(next.entry.scheduledAt)}
					</span>
				</div>
			) : (
				<div className="text-sm text-muted-foreground">
					Nothing pending today.
				</div>
			)}
		</div>
	);
}

// Convenience: build a single-episode candidate list from raw entries.
export function singleEpisodeCandidates(
	episodeId: string,
	entries: TimetableEntry[],
): Candidate[] {
	return entries.map((entry) => ({ episodeId, entry }));
}

// Convenience: render the same `Next up · <time>` summary used inside other
// cards. Returned as a small string so we don't render the strip twice.
export function nextUpSummary(entries: TimetableEntry[]): string | null {
	const now = Date.now();
	const pick = pickImminent(
		entries.map((entry) => ({ episodeId: "_", entry })),
		now,
	);
	if (!pick) return null;
	return `${pick.entry.itemName} ${formatTime(pick.entry.scheduledAt)}`;
}
