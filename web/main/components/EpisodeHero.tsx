import { Link } from "@tanstack/react-router";
import { ChevronRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { daysSince, formatDate, relativeTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import type { Dose, Episode, Pet, Prescription } from "@/types/api.ts";
import { Avatar } from "./Avatar.tsx";

export function EpisodeHero({
	episode,
	pet,
	prescriptions,
	doses,
}: {
	episode: Episode;
	pet?: Pet | null;
	prescriptions: Prescription[];
	doses: Dose[];
}) {
	const day = daysSince(episode.startedAt);
	const confirmed = prescriptions.filter(
		(p) => p.status === "confirmed",
	).length;
	const lastDose = [...doses]
		.filter((d) => d.status === "given")
		.sort(
			(a, b) => new Date(b.actualAt).getTime() - new Date(a.actualAt).getTime(),
		)[0];

	const isOpen = episode.status === "open";

	return (
		<header className="rounded-2xl border bg-card p-4 sm:p-5 space-y-3">
			{/* Breadcrumb row: avatar + pet · status badge · day. Single line, no
			    wasted vertical space. */}
			<div className="flex items-center gap-2.5 min-w-0">
				{pet ? (
					<Link
						to="/pet/$petId"
						params={{ petId: pet.id }}
						className="shrink-0 hover:opacity-80 transition-opacity"
					>
						<Avatar name={pet.name} size="sm" />
					</Link>
				) : null}
				<div className="flex items-center gap-1.5 min-w-0 text-xs flex-wrap">
					{pet ? (
						<>
							<Link
								to="/pet/$petId"
								params={{ petId: pet.id }}
								className="font-semibold text-foreground hover:underline truncate"
							>
								{pet.name}
							</Link>
							<ChevronRight
								className="w-3 h-3 text-muted-foreground/60 shrink-0"
								aria-hidden
							/>
						</>
					) : null}
					<Badge
						className={cn(
							"text-[10px] uppercase tracking-wider shrink-0",
							isOpen
								? "bg-[var(--color-status-given)] text-white border-transparent"
								: "",
						)}
						variant={isOpen ? "default" : "secondary"}
					>
						{episode.status}
					</Badge>
					<span className="text-muted-foreground">
						Day <span className="font-time font-semibold">{day}</span>
					</span>
				</div>
			</div>

			{/* Title — sans display, tight tracking. */}
			<h1 className="font-display text-2xl sm:text-[1.7rem] font-bold leading-[1.15]">
				{episode.title}
			</h1>

			{/* Live status (overrides summary when AI insights wrote one). */}
			{episode.summary ? (
				<div>
					<p className="text-sm leading-snug text-foreground/90 whitespace-pre-wrap">
						{episode.summary}
					</p>
					{episode.currentStatusAt ? (
						<div className="mt-1 text-[10px] text-muted-foreground inline-flex items-center gap-1">
							<Sparkles className="w-2.5 h-2.5 text-primary" />
							Status updated {relativeTime(episode.currentStatusAt)}
						</div>
					) : null}
				</div>
			) : null}

			{/* Stats — inline divider row, not a 3-col grid. */}
			<div className="flex items-center gap-x-4 gap-y-1 flex-wrap pt-2.5 border-t border-border/50 text-xs">
				<Stat label="Started" value={formatDate(episode.startedAt)} />
				<Stat
					label="Prescriptions"
					value={confirmed === 0 ? "—" : String(confirmed)}
				/>
				<Stat
					label="Last dose"
					value={lastDose ? formatDate(lastDose.actualAt) : "—"}
				/>
			</div>
		</header>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<span className="inline-flex items-baseline gap-1.5">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-semibold text-foreground">{value}</span>
		</span>
	);
}
