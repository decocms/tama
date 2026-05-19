import { ChevronDown, Pill, Repeat, Utensils } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import type { Prescription, ScheduleItem } from "@/types/api.ts";

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
}: {
	prescriptions: Prescription[];
}) {
	const cards = aggregate(prescriptions);
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
				<MedicineCardView key={`${c.prescriptionId}-${c.item.name}`} card={c} />
			))}
		</div>
	);
}

function MedicineCardView({ card }: { card: MedicineCard }) {
	const { item } = card;
	const isMeal = item.kind === "meal";
	const upcomingIdx = nextUpcomingIdx(item.times, new Date());
	const [notesOpen, setNotesOpen] = useState(false);

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

	return (
		<article
			className={cn(
				"rounded-2xl bg-card surface border-l-4 overflow-hidden",
				accent.border,
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
				<h3 className="font-display text-lg font-semibold leading-tight truncate flex-1">
					{item.name}
				</h3>
				<Badge
					variant="outline"
					className="text-[10px] uppercase tracking-wider"
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
			</div>
		</article>
	);
}
