import { Link } from "@tanstack/react-router";
import { ArrowRight, Pill, Utensils } from "lucide-react";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { daysSince } from "@/lib/format.ts";
import type { Episode, Pet, TimetableEntry } from "@/types/api.ts";
import { useEpisode, useEpisodes, usePets } from "../lib/queries.ts";
import { Avatar } from "./Avatar.tsx";
import { NowStrip } from "./NowStrip.tsx";
import { TimeColumn } from "./TimeColumn.tsx";

const NEXT_LIMIT = 3;

export function OpenEpisodes() {
	const { data: episodes, isLoading } = useEpisodes();
	const { data: pets } = usePets();
	const open = (episodes ?? []).filter((e) => e.status === "open");

	const petById = useMemo(() => {
		const map = new Map<string, Pet>();
		for (const p of pets ?? []) map.set(p.id, p);
		return map;
	}, [pets]);

	if (isLoading) {
		return <Skeleton className="h-24 w-full rounded-xl" />;
	}
	if (open.length === 0) return null;

	const showLinks = open.length > 1;

	return (
		<div className="space-y-3">
			{open.map((ep) => (
				<EpisodeNowStrip
					key={`now-${ep.id}`}
					episode={ep}
					pet={petById.get(ep.petId) ?? null}
					showLink={showLinks}
				/>
			))}
			<div className="grid gap-2.5">
				{open.map((ep) => (
					<OpenEpisodeCard
						key={ep.id}
						episode={ep}
						pet={petById.get(ep.petId) ?? null}
					/>
				))}
			</div>
		</div>
	);
}

function EpisodeNowStrip({
	episode,
	pet,
	showLink,
}: {
	episode: Episode;
	pet: Pet | null;
	showLink: boolean;
}) {
	const { data } = useEpisode(episode.id);
	const candidates = (data?.timetable ?? []).map((entry) => ({
		episodeId: episode.id,
		episodeTitle: episode.title,
		petName: pet?.name,
		entry,
	}));
	return <NowStrip candidates={candidates} showEpisodeLink={showLink} />;
}

function OpenEpisodeCard({
	episode,
	pet,
}: {
	episode: Episode;
	pet: Pet | null;
}) {
	const { data } = useEpisode(episode.id);
	const upcoming = pickUpcoming(data?.timetable ?? []);
	const day = daysSince(episode.startedAt);

	return (
		<Link
			to="/episode/$episodeId"
			params={{ episodeId: episode.id }}
			className="group block min-w-0 rounded-xl border bg-card hover:border-primary/40 transition-colors"
		>
			<div className="p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-start gap-3 min-w-0 flex-1">
						{pet ? <Avatar name={pet.name} size="md" /> : null}
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-0.5">
								{pet ? (
									<>
										<span className="text-foreground">{pet.name}</span>
										<span aria-hidden>·</span>
									</>
								) : null}
								<span>Day {day}</span>
							</div>
							<h3 className="font-display text-lg font-semibold leading-tight truncate">
								{episode.title}
							</h3>
							{episode.currentStatus ? (
								<p className="text-xs text-foreground/75 truncate mt-0.5">
									{episode.currentStatus}
								</p>
							) : episode.summary ? (
								<p className="text-xs text-muted-foreground truncate mt-0.5">
									{episode.summary}
								</p>
							) : null}
						</div>
					</div>
					<ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 group-hover:text-primary transition-colors" />
				</div>

				{upcoming.length > 0 ? (
					<ul className="mt-3 space-y-1">
						{upcoming.map((e) => (
							<li key={e.id} className="flex items-center gap-2 text-sm">
								<TimeColumn iso={e.scheduledAt} size="md" className="w-12" />
								<KindGlyph kind={e.kind} />
								<span className="truncate flex-1">{e.itemName}</span>
								{e.dosage ? (
									<span className="text-xs text-muted-foreground truncate shrink-0">
										{e.dosage}
									</span>
								) : null}
							</li>
						))}
					</ul>
				) : data ? (
					<p className="mt-3 text-xs text-muted-foreground">
						Nothing pending in the next 48h.
					</p>
				) : (
					<Skeleton className="mt-3 h-4 w-full" />
				)}
			</div>
		</Link>
	);
}

function KindGlyph({ kind }: { kind: "medication" | "meal" }) {
	return kind === "meal" ? (
		<Utensils className="w-3.5 h-3.5 text-[var(--color-accent-meal)] shrink-0" />
	) : (
		<Pill className="w-3.5 h-3.5 text-[var(--color-accent-med)] shrink-0" />
	);
}

function pickUpcoming(entries: TimetableEntry[]): TimetableEntry[] {
	const now = Date.now();
	return entries
		.filter(
			(e) => e.status === "pending" && new Date(e.scheduledAt).getTime() >= now,
		)
		.slice(0, NEXT_LIMIT);
}
