import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { deriveCompanionStatus } from "@/companion/state.ts";
import type { Pet, TimetableEntry } from "@/types/api.ts";
import { Avatar } from "./Avatar.tsx";

function browserTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}

// `entries` is passed in (the Pet page loads the timetable once and gates the
// whole view on it) so the avatar's mood is correct on first paint — no fetch
// here, no pop-in after the skeleton clears.
export function PetHero({
	pet,
	entries = [],
}: {
	pet: Pet;
	entries?: TimetableEntry[];
}) {
	// Re-tick each minute so the avatar's mood tracks the live schedule
	// ("due in 5 min" → "overdue") without waiting for a refetch.
	const [tick, setTick] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setTick((n) => n + 1), 60_000);
		return () => clearInterval(id);
	}, []);

	const status = useMemo(
		() =>
			deriveCompanionStatus({
				entries,
				petName: pet.name ?? "Tama",
				summary: pet.summary ?? null,
				now: new Date(),
				timeZone: pet.timezone ?? browserTimeZone(),
			}),
		// biome-ignore lint/correctness/useExhaustiveDependencies: tick re-derives
		[entries, pet, tick],
	);

	// The hero is a diminutive of the full companion: same live state, small.
	const heroSvg = pet.svgPack?.[status.state] ?? pet.svgPack?.idle ?? null;

	return (
		<div className="rounded-2xl bg-card surface overflow-hidden">
			<div className="p-5 flex flex-col sm:flex-row sm:items-center gap-5">
				{heroSvg ? (
					<Link
						to="/companion"
						aria-label={`Open ${pet.name} full screen — ${status.headline}`}
						title={status.headline}
						className="group relative shrink-0 mx-auto sm:mx-0 w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-[#e7dfce] border border-border/60 flex items-center justify-center overflow-hidden cursor-pointer transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
					>
						{/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own SVG renderer */}
						<div
							key={status.state}
							className="w-[88%] h-[88%] [&>svg]:w-full [&>svg]:h-full"
							style={{ animation: "breathe 3s ease-in-out infinite" }}
							dangerouslySetInnerHTML={{ __html: heroSvg }}
						/>
						<span className="absolute inset-x-0 bottom-0 py-1 bg-black/30 text-white text-[9px] uppercase tracking-wider text-center opacity-0 group-hover:opacity-100 transition-opacity">
							Tap to open
						</span>
					</Link>
				) : (
					<Avatar name={pet.name} size="xl" />
				)}
				<div className="flex-1 min-w-0">
					<h1 className="font-display text-3xl sm:text-4xl font-semibold leading-none">
						{pet.name}
					</h1>
					<div className="flex flex-wrap items-center gap-1.5 mt-2">
						<Chip>{pet.species}</Chip>
						{pet.breed ? <Chip>{pet.breed}</Chip> : null}
						{pet.dob ? <Chip muted>{pet.dob}</Chip> : null}
						{pet.weightKg ? <Chip muted>{pet.weightKg} kg</Chip> : null}
						{pet.timezone ? (
							<Chip muted className="font-time text-xs">
								{pet.timezone}
							</Chip>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}

function Chip({
	children,
	muted,
	className,
}: {
	children: React.ReactNode;
	muted?: boolean;
	className?: string;
}) {
	return (
		<Badge
			variant="outline"
			className={cn(
				"text-xs font-normal",
				muted ? "text-muted-foreground" : "",
				className,
			)}
		>
			{children}
		</Badge>
	);
}
