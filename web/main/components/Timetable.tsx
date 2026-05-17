import { Check, Clock, Pill, Utensils, X } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { dayLabel, formatTime } from "@/lib/format.ts";
import type { TimetableEntry } from "@/types/api.ts";
import { useLogDose } from "../lib/queries.ts";

export function Timetable({
	episodeId,
	entries,
}: {
	episodeId: string;
	entries: TimetableEntry[];
}) {
	const log = useLogDose(episodeId);

	if (entries.length === 0) {
		return (
			<div className="rounded-lg border p-6 text-sm text-muted-foreground">
				No scheduled items yet. Upload a confirmed prescription to populate the
				timetable.
			</div>
		);
	}

	const give = (e: TimetableEntry) => {
		const planned = new Date(e.scheduledAt).getTime();
		const now = Date.now();
		const deltaH = (now - planned) / (60 * 60 * 1000);
		const adjustment =
			Math.abs(deltaH) >= 0.5
				? {
						kind: "shift-next-by-h" as const,
						hours: Math.round(deltaH * 10) / 10,
					}
				: undefined;
		log.mutate({
			itemName: e.itemName,
			kind: e.kind,
			plannedAt: e.scheduledAt,
			actualAt: new Date().toISOString(),
			status: "given",
			adjustment,
		});
	};

	const skip = (e: TimetableEntry) =>
		log.mutate({
			itemName: e.itemName,
			kind: e.kind,
			plannedAt: e.scheduledAt,
			status: "skipped",
			note: "skipped via UI",
		});

	const grouped = groupByDay(entries);

	return (
		<div className="space-y-6">
			{Object.entries(grouped).map(([day, items]) => (
				<div key={day} className="space-y-2">
					<h3 className="text-sm font-semibold text-muted-foreground">{day}</h3>
					<ul className="divide-y rounded-lg border">
						{items.map((e) => (
							<li
								key={e.id}
								className={`flex items-center gap-3 p-3 ${
									e.status === "given" ? "opacity-60" : ""
								}`}
							>
								<div className="text-sm font-mono w-14">
									{formatTime(e.scheduledAt)}
								</div>
								<KindIcon kind={e.kind} />
								<div className="flex-1 min-w-0">
									<div className="font-medium truncate">{e.itemName}</div>
									{e.dosage || e.notes ? (
										<div className="text-xs text-muted-foreground truncate">
											{[e.dosage, e.notes].filter(Boolean).join(" • ")}
										</div>
									) : null}
								</div>
								<StatusPill status={e.status} />
								{e.status === "pending" ? (
									<div className="flex gap-1">
										<Button
											size="sm"
											variant="default"
											onClick={() => give(e)}
											disabled={log.isPending}
										>
											<Check className="w-3 h-3" />
											Give
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => skip(e)}
											disabled={log.isPending}
										>
											<X className="w-3 h-3" />
										</Button>
									</div>
								) : null}
							</li>
						))}
					</ul>
				</div>
			))}
		</div>
	);
}

function groupByDay(
	entries: TimetableEntry[],
): Record<string, TimetableEntry[]> {
	const out: Record<string, TimetableEntry[]> = {};
	for (const e of entries) {
		const key = dayLabel(e.scheduledAt);
		if (!out[key]) out[key] = [];
		out[key].push(e);
	}
	return out;
}

function KindIcon({ kind }: { kind: "medication" | "meal" }) {
	return kind === "meal" ? (
		<Utensils className="w-4 h-4 text-amber-600" />
	) : (
		<Pill className="w-4 h-4 text-blue-600" />
	);
}

function StatusPill({ status }: { status: "pending" | "given" | "skipped" }) {
	if (status === "given") {
		return (
			<Badge variant="secondary" className="text-xs">
				<Check className="w-3 h-3" />
				Given
			</Badge>
		);
	}
	if (status === "skipped") {
		return (
			<Badge variant="destructive" className="text-xs">
				<X className="w-3 h-3" />
				Skipped
			</Badge>
		);
	}
	return (
		<Badge variant="outline" className="text-xs">
			<Clock className="w-3 h-3" />
			Pending
		</Badge>
	);
}
