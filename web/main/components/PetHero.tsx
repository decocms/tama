import { Link } from "@tanstack/react-router";
import { Cake, Globe } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils.ts";
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

// "America/Sao_Paulo" → "São Paulo" (drop the technical region prefix).
function friendlyTz(tz: string): string {
	const city = tz.split("/").pop() ?? tz;
	return city.replace(/_/g, " ").replace("Sao ", "São ");
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
		<div
			className="rounded-3xl brut overflow-hidden"
			style={{
				background:
					"linear-gradient(135deg, #fff8ee 0%, #fdeede 55%, #fbe7d6 100%)",
			}}
		>
			<div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6">
				{heroSvg ? (
					<Link
						to="/companion"
						aria-label={`Open ${pet.name} full screen — ${status.headline}`}
						title={status.headline}
						className="group relative shrink-0 mx-auto sm:mx-0 w-40 h-40 sm:w-48 sm:h-48 rounded-full bg-[#efe6d3] border-2 border-[#2a1f17] flex items-center justify-center overflow-hidden cursor-pointer transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2a1f17]"
					>
						{/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own SVG renderer */}
						<div
							key={status.state}
							className="w-[90%] h-[90%] [&>svg]:w-full [&>svg]:h-full"
							style={{ animation: "breathe 3s ease-in-out infinite" }}
							dangerouslySetInnerHTML={{ __html: heroSvg }}
						/>
						<span className="absolute inset-x-0 bottom-0 py-1 bg-[#2a1f17]/70 text-[#fff8ee] text-[9px] font-bold uppercase tracking-wider text-center opacity-0 group-hover:opacity-100 transition-opacity">
							Tap to open
						</span>
					</Link>
				) : (
					<Avatar name={pet.name} size="xl" />
				)}
				<div className="flex-1 min-w-0">
					<h1 className="font-display text-4xl sm:text-5xl font-bold leading-none tracking-[-0.02em] text-[#2a1f17]">
						{pet.name}
					</h1>
					<div className="flex flex-wrap items-center gap-2 mt-3">
						<Chip bg="#ffbd8e">{pet.species}</Chip>
						{pet.breed ? <Chip bg="#b6e3c8">{pet.breed}</Chip> : null}
						{pet.dob ? (
							<Chip>
								<Cake className="w-3.5 h-3.5 opacity-70" />
								{pet.dob}
							</Chip>
						) : null}
						{pet.weightKg ? <Chip>{pet.weightKg} kg</Chip> : null}
						{pet.timezone ? (
							<Chip>
								<Globe className="w-3.5 h-3.5 opacity-70" />
								{friendlyTz(pet.timezone)}
							</Chip>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}

// Soft pill. `bg` (a landing pastel) tints the primary facts (species/breed);
// the rest fall back to a warm cream. Dark-ink text reads on every option.
function Chip({
	children,
	bg,
	className,
}: {
	children: React.ReactNode;
	bg?: string;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full border border-[#2a1f17]/12 font-medium text-[#2a1f17]",
				className,
			)}
			style={{ backgroundColor: bg ? `${bg}99` : "#fff8eecc" }}
		>
			{children}
		</span>
	);
}
