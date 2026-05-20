import {
	CheckCircle2,
	ChevronDown,
	Loader2,
	Pill,
	Repeat,
	StopCircle,
	Utensils,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import type {
	Prescription,
	ScheduleItem,
	ScheduleState,
} from "@/types/api.ts";
import { useStopItem } from "../lib/queries.ts";

interface MedicineCard {
	item: ScheduleItem;
	prescriptionId: string;
	prescriptionCreatedAt: string;
}

// Aggregate every schedule item across all confirmed prescriptions and dedupe
// by (name, kind, times-tuple). Latest prescription wins on collision.
function aggregate(prescriptions: Prescription[]): MedicineCard[] {
	const byKey = new Map<string, MedicineCard>();
	const sorted = prescriptions
		.filter((p) => p.status === "confirmed")
		.sort(
			(a, b) =>
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		);
	for (const rx of sorted) {
		for (const item of rx.scheduleItems) {
			const key = `${item.name.toLowerCase()}::${item.kind}::${item.times.join(",")}`;
			byKey.set(key, {
				item,
				prescriptionId: rx.id,
				prescriptionCreatedAt: rx.createdAt,
			});
		}
	}
	return Array.from(byKey.values()).sort((a, b) => {
		if (a.item.kind !== b.item.kind) {
			return a.item.kind === "medication" ? -1 : 1;
		}
		return a.item.name.localeCompare(b.item.name);
	});
}

// Pick the next upcoming time-of-day from a list of "HH:mm" strings,
// relative to "now" in local clock terms. Returns the index, or 0 if none.
function nextUpcomingIdx(times: string[], now: Date): number {
	const nowMinutes = now.getHours() * 60 + now.getMinutes();
	for (let i = 0; i < times.length; i++) {
		const [h, m] = times[i].split(":").map(Number);
		if (h * 60 + m >= nowMinutes) return i;
	}
	return 0;
}

export function Medicines({
	prescriptions,
	scheduleStates,
	episodeId,
}: {
	prescriptions: Prescription[];
	scheduleStates: ScheduleState[];
	episodeId: string;
}) {
	const cards = aggregate(prescriptions);
	// Index live state by lowercased item name so MedicineCardView can pull
	// the lifecycle bounds + active flag for its specific item.
	const stateByName = new Map<string, ScheduleState>();
	for (const s of scheduleStates) {
		stateByName.set(s.displayName.toLowerCase(), s);
	}
	if (cards.length === 0) {
		return (
			<p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground bg-secondary/40">
				No confirmed medicines yet. Upload a prescription below to populate this
				list.
			</p>
		);
	}
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{cards.map((c) => (
				<MedicineCardView
					key={`${c.prescriptionId}-${c.item.name}`}
					card={c}
					state={stateByName.get(c.item.name.toLowerCase()) ?? null}
					episodeId={episodeId}
				/>
			))}
		</div>
	);
}

function MedicineCardView({
	card,
	state,
	episodeId,
}: {
	card: MedicineCard;
	state: ScheduleState | null;
	episodeId: string;
}) {
	const { item } = card;
	const isMeal = item.kind === "meal";
	const upcomingIdx = nextUpcomingIdx(item.times, new Date());
	const [notesOpen, setNotesOpen] = useState(false);
	const [confirmStop, setConfirmStop] = useState(false);
	const stop = useStopItem(episodeId);
	const stopped = state ? !state.active : false;

	const accent = isMeal
		? {
				border: "border-l-[var(--color-accent-meal)]",
				tint: "bg-[var(--color-tint-meal)]",
				icon: "bg-[var(--color-tint-meal)] text-[var(--color-accent-meal)]",
			}
		: {
				border: "border-l-[var(--color-accent-med)]",
				tint: "bg-[var(--color-tint-med)]",
				icon: "bg-[var(--color-tint-med)] text-[var(--color-accent-med)]",
			};

	const metaParts: string[] = [];
	if (item.dosage)
		metaParts.push(item.route ? `${item.dosage} (${item.route})` : item.dosage);
	if (item.frequencyHours) metaParts.push(`every ${item.frequencyHours}h`);
	if (item.durationDays) metaParts.push(`for ${item.durationDays}d`);

	// Treatment lifecycle badge — derived from the live schedule_state row
	// (not the prescription template). Three visual states:
	//   • stopped:  active=false → "Stopped" pill, card de-emphasized
	//   • ending:   active=true, endsAt set → "Day X / Y" or "ends in Nd"
	//   • open:     active=true, no endsAt → no badge (open-ended course)
	const lifecycle = describeLifecycle(state);

	return (
		<article
			className={cn(
				"rounded-2xl bg-card surface border-l-4 overflow-hidden transition-opacity",
				accent.border,
				stopped && "opacity-55",
			)}
		>
			<header className="flex items-center gap-2.5 p-3.5 pb-2.5">
				<div
					className={cn(
						"shrink-0 w-9 h-9 rounded-full flex items-center justify-center",
						accent.icon,
					)}
				>
					{isMeal ? (
						<Utensils className="w-4 h-4" />
					) : (
						<Pill className="w-4 h-4" />
					)}
				</div>
				<h3
					className={cn(
						"font-display text-lg font-semibold leading-tight truncate flex-1",
						stopped && "line-through decoration-2 decoration-muted-foreground/40",
					)}
				>
					{item.name}
				</h3>
				<Badge
					variant="outline"
					className="text-[10px] uppercase tracking-wider shrink-0"
				>
					{isMeal ? "meal" : "med"}
				</Badge>
			</header>

			<div className="px-3.5 pb-3.5 space-y-2.5">
				<div className="flex flex-wrap gap-1">
					{item.times.map((t, i) => (
						<span
							key={t}
							className={cn(
								"font-time tabular-nums text-sm px-2 py-0.5 rounded-md border",
								i === upcomingIdx
									? cn(
											accent.tint,
											"border-current/20",
											isMeal
												? "text-[var(--color-accent-meal)]"
												: "text-[var(--color-accent-med)]",
											"font-semibold",
										)
									: "bg-secondary/50 text-muted-foreground border-transparent",
							)}
						>
							{t}
						</span>
					))}
				</div>

				{metaParts.length > 0 ? (
					<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<Repeat className="w-3 h-3 shrink-0" />
						<span className="truncate">{metaParts.join(" · ")}</span>
					</div>
				) : null}

				{lifecycle ? (
					<div
						className={cn(
							"inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md",
							lifecycle.tone === "stopped" &&
								"bg-muted text-muted-foreground",
							lifecycle.tone === "ending-soon" &&
								"bg-amber-500/10 text-amber-700 dark:text-amber-300",
							lifecycle.tone === "active" &&
								"bg-[var(--color-status-given)]/10 text-[var(--color-status-given)]",
						)}
					>
						{lifecycle.tone === "stopped" ? (
							<CheckCircle2 className="w-3 h-3" />
						) : null}
						{lifecycle.label}
					</div>
				) : null}

				{item.notes ? (
					<div>
						<button
							type="button"
							onClick={() => setNotesOpen((v) => !v)}
							className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
						>
							<ChevronDown
								className={cn(
									"w-3 h-3 transition-transform",
									notesOpen ? "" : "-rotate-90",
								)}
							/>
							{notesOpen ? "Hide notes" : "Notes"}
						</button>
						{notesOpen ? (
							<p className="mt-1 text-xs whitespace-pre-wrap text-foreground/80">
								{item.notes}
							</p>
						) : null}
					</div>
				) : null}

				{state && !stopped ? (
					<div className="pt-1.5 -mb-1">
						<Button
							size="sm"
							variant="ghost"
							onClick={() => setConfirmStop(true)}
							disabled={stop.isPending}
							className="text-xs text-muted-foreground hover:text-destructive h-7 px-2"
						>
							{stop.isPending ? (
								<Loader2 className="w-3 h-3 animate-spin" />
							) : (
								<StopCircle className="w-3 h-3" />
							)}
							Stop {isMeal ? "meal" : "medicine"}
						</Button>
					</div>
				) : null}
			</div>

			<AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Stop {item.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							It will no longer appear in the timetable and reminders will stop.
							Past doses stay in the history. You can extend it later via the
							assistant if needed.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								stop.mutate(
									{ itemName: item.name },
									{
										onSuccess: () => {
											toast.success(`${item.name} stopped`);
											setConfirmStop(false);
										},
										onError: (err) => toast.error((err as Error).message),
									},
								);
							}}
						>
							Stop {item.name}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</article>
	);
}

interface Lifecycle {
	label: string;
	tone: "stopped" | "ending-soon" | "active";
}

function describeLifecycle(state: ScheduleState | null): Lifecycle | null {
	if (!state) return null;
	if (!state.active) {
		const endedAt = state.endsAt ? new Date(state.endsAt) : null;
		const daysAgo =
			endedAt ?
				Math.max(0, Math.floor((Date.now() - endedAt.getTime()) / 86400000))
				: null;
		return {
			label:
				daysAgo === null
					? "Stopped"
					: daysAgo === 0
						? "Stopped today"
						: `Stopped ${daysAgo}d ago`,
			tone: "stopped",
		};
	}
	if (!state.endsAt || !state.startsAt) return null;
	const start = new Date(state.startsAt).getTime();
	const end = new Date(state.endsAt).getTime();
	const now = Date.now();
	if (end <= now) return { label: "Course complete", tone: "stopped" };
	const totalDays = Math.max(1, Math.round((end - start) / 86400000));
	const dayN = Math.max(1, Math.ceil((now - start) / 86400000));
	const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
	return {
		label: `Day ${Math.min(dayN, totalDays)} / ${totalDays} · ${daysLeft}d left`,
		tone: daysLeft <= 1 ? "ending-soon" : "active",
	};
}
