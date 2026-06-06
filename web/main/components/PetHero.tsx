import { cn } from "@/lib/utils.ts";
import { Badge } from "@/components/ui/badge.tsx";
import type { Pet } from "@/types/api.ts";
import { Avatar } from "./Avatar.tsx";

export function PetHero({ pet }: { pet: Pet }) {
	return (
		<div className="rounded-2xl bg-card surface overflow-hidden">
			<div className="p-5 flex flex-col sm:flex-row sm:items-center gap-5">
				{pet.svgPack?.idle ? (
					<div className="shrink-0 mx-auto sm:mx-0 w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-[#e7dfce] border border-border/60 flex items-center justify-center overflow-hidden">
						{/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own SVG renderer */}
						<div
							className="w-[88%] h-[88%] [&>svg]:w-full [&>svg]:h-full"
							aria-label={pet.name}
							dangerouslySetInnerHTML={{ __html: pet.svgPack.idle }}
						/>
					</div>
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
