import { Check, Pill, SkipForward, Utensils } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import type { ScheduleState, TimetableEntry } from "@/types/api.ts";
import { TimeBox } from "../components/Card.tsx";
import { Layout } from "../components/Layout.tsx";
import { Section } from "../components/Section.tsx";
import {
	useLogDose,
	useScheduleStates,
	useStopItem,
	useTimetable,
} from "../lib/queries.ts";

export function TimetablePage() {
	const { data: entries, isPending: ttPending } = useTimetable();
	const { data: states, isPending: ssPending } = useScheduleStates();
	// Gate on BOTH so the schedule list doesn't pop in after the dose sections.
	const isLoading = ttPending || ssPending;

	const now = Date.now();
	const pending = (entries ?? []).filter((e) => e.status === "pending");
	const overdue = pending
		.filter((e) => new Date(e.scheduledAt).getTime() < now)
		.sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));
	const upcoming = pending
		.filter((e) => new Date(e.scheduledAt).getTime() >= now)
		.sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));
	const doneToday = (entries ?? []).filter((e) => e.status !== "pending");

	const activeMeds = (states ?? []).filter((s) => s.active);

	return (
		<Layout breadcrumb={<span>timetable</span>}>
			<div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
				{isLoading ? (
					<Skeleton className="h-48 w-full rounded-2xl" />
				) : (
					<>
						{overdue.length > 0 ? (
							<Section title="Overdue" eyebrow="Give these now">
								<div className="space-y-2">
									{overdue.map((e) => (
										<DoseRow key={e.id} entry={e} overdue />
									))}
								</div>
							</Section>
						) : null}

						<Section title="Coming up" eyebrow="Next doses">
							{upcoming.length === 0 ? (
								<p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground bg-secondary/40">
									Nothing scheduled in the window. Add meds via a prescription
									in chat or Assets.
								</p>
							) : (
								<div className="space-y-2">
									{upcoming.map((e) => (
										<DoseRow key={e.id} entry={e} />
									))}
								</div>
							)}
						</Section>

						{doneToday.length > 0 ? (
							<Section title="Logged" eyebrow="Recent">
								<div className="space-y-2">
									{doneToday.slice(0, 12).map((e) => (
										<DoseRow key={e.id} entry={e} />
									))}
								</div>
							</Section>
						) : null}

						{activeMeds.length > 0 ? (
							<Section title="Active treatments" eyebrow="On the schedule">
								<div className="space-y-2">
									{activeMeds.map((s) => (
										<MedicineRow key={s.id} state={s} />
									))}
								</div>
							</Section>
						) : null}
					</>
				)}
			</div>
		</Layout>
	);
}

function DoseRow({
	entry,
	overdue,
}: {
	entry: TimetableEntry;
	overdue?: boolean;
}) {
	const log = useLogDose();
	const isMeal = entry.kind === "meal";
	const pending = entry.status === "pending";

	const give = (status: "given" | "skipped") =>
		log.mutate(
			{ itemName: entry.itemName, kind: entry.kind, status },
			{
				onSuccess: () =>
					toast.success(`${entry.itemName} ${status}`),
				onError: (e) => toast.error((e as Error).message),
			},
		);

	const msUntil = new Date(entry.scheduledAt).getTime() - Date.now();
	const tone = overdue
		? "overdue"
		: entry.status === "given"
			? "done"
			: entry.status === "skipped"
				? "default"
				: msUntil <= 60 * 60 * 1000
					? "soon"
					: "upcoming";

	return (
		<div className="flex items-center gap-2.5 sm:gap-3 bg-card surface p-3">
			<TimeBox iso={entry.scheduledAt} tone={tone} />
			{/* Type icon is a nicety — hidden on phones so the name gets the room. */}
			<div
				className={cn(
					"shrink-0 w-8 h-8 rounded-full hidden sm:flex items-center justify-center",
					isMeal
						? "bg-[var(--color-tint-meal,#fff1d6)] text-[var(--color-accent-meal,#ea580c)]"
						: "bg-[var(--color-tint-med,#dbeafe)] text-[var(--color-accent-med,#2563eb)]",
				)}
			>
				{isMeal ? (
					<Utensils className="w-4 h-4" />
				) : (
					<Pill className="w-4 h-4" />
				)}
			</div>
			<div className="flex-1 min-w-0">
				<div className="font-semibold text-sm sm:text-base leading-snug">
					{entry.itemName}
				</div>
				{entry.dosage ? (
					<div className="text-xs sm:text-sm text-muted-foreground">
						{entry.dosage}
					</div>
				) : null}
			</div>
			{pending ? (
				<div className="flex gap-1.5 shrink-0">
					<Button
						size="sm"
						disabled={log.isPending}
						onClick={() => give("given")}
						aria-label="Mark given"
					>
						<Check className="w-3.5 h-3.5" />
						<span className="hidden sm:inline">Give</span>
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={log.isPending}
						onClick={() => give("skipped")}
						aria-label="Skip"
					>
						<SkipForward className="w-3.5 h-3.5" />
					</Button>
				</div>
			) : (
				<Badge variant="outline" className="text-[10px] capitalize shrink-0">
					{entry.status}
				</Badge>
			)}
		</div>
	);
}

function MedicineRow({ state }: { state: ScheduleState }) {
	const stop = useStopItem();
	return (
		<div className="flex items-center gap-3 bg-card surface p-3">
			<div className="flex-1 min-w-0">
				<div className="font-semibold text-sm sm:text-base truncate">
					{state.displayName}
				</div>
				<div className="text-sm text-muted-foreground">
					<span className="font-time tabular-nums">
						{state.times && state.times.length > 0
							? state.times.join(" · ")
							: `every ${state.intervalHours}h`}
					</span>
					{state.dosage ? ` · ${state.dosage}` : ""}
					{state.endsAt ? ` · ends ${state.endsAt.slice(0, 10)}` : ""}
				</div>
			</div>
			<Button
				size="sm"
				variant="ghost"
				disabled={stop.isPending}
				onClick={() =>
					stop.mutate(
						{ itemName: state.displayName },
						{
							onSuccess: () => toast(`Stopped ${state.displayName}`),
							onError: (e) => toast.error((e as Error).message),
						},
					)
				}
			>
				Stop
			</Button>
		</div>
	);
}
