import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils.ts";
import { Badge } from "@/components/ui/badge.tsx";
import type { Pet } from "@/types/api.ts";
import { Avatar } from "./Avatar.tsx";

export function PetHero({ pet }: { pet: Pet }) {
	return (
		<div className="rounded-2xl bg-card surface overflow-hidden">
			<div className="p-5 flex flex-col sm:flex-row sm:items-center gap-5">
				{pet.svgPack?.idle ? (
					<Link
						to="/companion"
						aria-label={`Open ${pet.name} full screen`}
						className="group relative shrink-0 mx-auto sm:mx-0 w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-[#e7dfce] border border-border/60 flex items-center justify-center overflow-hidden cursor-pointer transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
					>
						{/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own SVG renderer */}
						<div
							className="w-[88%] h-[88%] [&>svg]:w-full [&>svg]:h-full"
							style={{ animation: "breathe 3s ease-in-out infinite" }}
							dangerouslySetInnerHTML={{ __html: pet.svgPack.idle }}
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
