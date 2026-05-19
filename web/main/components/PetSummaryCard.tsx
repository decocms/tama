import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Pill, Utensils } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { daysSince, relativeTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import type { Episode, Pet, TimetableEntry } from "@/types/api.ts";
import { useEpisode, useLogDose, useSnoozeItem } from "../lib/queries.ts";
import { Avatar } from "./Avatar.tsx";
import { TimeColumn } from "./TimeColumn.tsx";

/**
 * The home-page hero unit. Folds together everything we used to render as
 * three separate widgets (now-strip + open-episode card + pet roster
 * tile) into one card per pet. The whole card is a stretched-link target:
 *  - if the pet has an active episode → opens that episode
 *  - otherwise → opens the pet page
 *
 * "Give now" / "Snooze" are nested as proper buttons that block the
 * stretched link's click, so the user can act on the next dose without
 * accidentally navigating away.
 */
export function PetSummaryCard({
	pet,
	activeEpisode,
}: {
	pet: Pet;
	activeEpisode: Episode | null;
}) {
	const navigate = useNavigate();
	const navigateToDetail = () => {
		if (activeEpisode) {
			navigate({
				to: "/episode/$episodeId",
				params: { episodeId: activeEpisode.id },
			});
		} else {
			navigate({ to: "/pet/$petId", params: { petId: pet.id } });
		}
	};

	return (
		<article
			role="button"
			tabIndex={0}
			onClick={navigateToDetail}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					navigateToDetail();
				}
			}}
			className="relative rounded-2xl bg-card surface surface-hover transition-shadow p-5 sm:p-6 cursor-pointer"
			aria-label={
				activeEpisode
					? `Open episode ${activeEpisode.title}`
					: `Open ${pet.name}`
			}
		>
			<div className="flex items-start gap-4">
				<Avatar name={pet.name} size="lg" />
				<div className="flex-1 min-w-0">
					<div className="flex items-baseline gap-2 flex-wrap">
						<h2 className="font-display text-2xl sm:text-3xl font-semibold leading-none">
							{pet.name}
						</h2>
						{activeEpisode ? (
							<span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
								Day {daysSince(activeEpisode.startedAt)}
							</span>
						) : null}
					</div>
					<div className="text-xs text-muted-foreground mt-1 truncate">
						{[
							pet.species,
							pet.breed,
							pet.weightKg ? `${pet.weightKg} kg` : null,
						]
							.filter(Boolean)
							.join(" · ")}
					</div>
				</div>
				<ArrowRight className="w-5 h-5 shrink-0 text-muted-foreground" />
			</div>

			{activeEpisode ? (
				<div className="mt-5 pt-5 border-t border-foreground/[0.06] space-y-4">
					<EpisodeBlurb episode={activeEpisode} />
					<NextDoseStrip
						episodeId={activeEpisode.id}
						episodeTitle={activeEpisode.title}
					/>
				</div>
			) : (
				<div className="mt-4 text-xs text-muted-foreground">
					No active episode.
				</div>
			)}
		</article>
	);
}

function EpisodeBlurb({ episode }: { episode: Episode }) {
	return (
		<div className="min-w-0">
			<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1">
				Active episode
			</div>
			<div className="font-display text-lg font-semibold leading-tight truncate">
				{episode.title}
			</div>
			{episode.currentStatus ? (
				<p className="text-xs text-foreground/75 mt-1 line-clamp-2">
					{episode.currentStatus}
				</p>
			) : episode.summary ? (
				<p className="text-xs text-muted-foreground mt-1 line-clamp-2">
					{episode.summary}
				</p>
			) : null}
		</div>
	);
}

function NextDoseStrip({
	episodeId,
	episodeTitle,
}: {
	episodeId: string;
	episodeTitle: string;
}) {
	const { data } = useEpisode(episodeId);
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(id);
	}, []);

	const pick = pickImminent(data?.timetable ?? [], now);
	const log = useLogDose(episodeId);
	const snooze = useSnoozeItem(episodeId);

	if (!pick) {
		return (
			<div className="rounded-xl bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
				Nothing imminent in <span className="font-medium">{episodeTitle}</span>.
			</div>
		);
	}

	const target = new Date(pick.scheduledAt).getTime();
	const isOverdue = target < now;
	const isMeal = pick.kind === "meal";

	const handleGive = () => {
		log.mutate(
			{
				itemName: pick.itemName,
				kind: pick.kind,
				plannedAt: pick.scheduledAt,
				actualAt: new Date().toISOString(),
				status: "given",
			},
			{
				onSuccess: () => toast.success(`${pick.itemName} logged`),
				onError: (e) => toast.error((e as Error).message),
			},
		);
	};

	// Same smart-snooze rounding as NowStrip — keep behavior consistent.
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
		snooze.mutate(
			{ itemName: pick.itemName, hours: shiftHours },
			{
				onSuccess: () => toast(`Snoozed ${pick.itemName} ${shiftMinutes}m`),
				onError: (e) => toast.error((e as Error).message),
			},
		);
	};

	return (
		<div
			className={cn(
				"relative z-10 rounded-xl p-4 flex flex-col gap-3",
				isOverdue
					? "bg-[var(--color-tint-overdue)]"
					: "bg-[var(--color-tint-upcoming)]",
				isOverdue ? "animate-overdue-pulse" : "",
			)}
		>
			<div className="flex items-center gap-2">
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
			</div>
			<div className="min-w-0">
				<div className="font-display text-xl font-semibold leading-tight truncate">
					{pick.itemName}
				</div>
				<div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
					<TimeColumn
						iso={pick.scheduledAt}
						size="md"
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
						{relativeTime(pick.scheduledAt, now)}
					</span>
				</div>
				{pick.dosage ? (
					<div className="text-xs text-muted-foreground mt-0.5 truncate">
						{pick.dosage}
						{pick.route ? ` · ${pick.route}` : ""}
					</div>
				) : null}
			</div>
			<div className="flex gap-2">
				<Button
					size="sm"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						handleGive();
					}}
					disabled={log.isPending}
					className="font-semibold flex-1"
				>
					<Check className="w-4 h-4" />
					Give now
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						handleSnooze();
					}}
					disabled={log.isPending}
				>
					Snooze {shiftMinutes}m
				</Button>
			</div>
		</div>
	);
}

const SOON_MS = 2 * 60 * 60 * 1000;
const OVERDUE_GRACE_MS = 6 * 60 * 60 * 1000;

function pickImminent(
	entries: TimetableEntry[],
	now: number,
): TimetableEntry | null {
	const eligible = entries
		.filter((e) => e.status === "pending")
		.filter((e) => {
			const t = new Date(e.scheduledAt).getTime();
			const delta = t - now;
			return delta <= SOON_MS && delta >= -OVERDUE_GRACE_MS;
		})
		.sort(
			(a, b) =>
				new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
		);
	return eligible[0] ?? null;
}
