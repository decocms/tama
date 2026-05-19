import { Link } from "@tanstack/react-router";
import { ChevronRight, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import type { Pet } from "@/types/api.ts";
import { Avatar } from "./Avatar.tsx";

export function PetsList({
	pets,
	linkable = true,
	onDelete,
	deletingId,
}: {
	pets: Pet[];
	linkable?: boolean;
	onDelete?: (petId: string, name: string) => void;
	deletingId?: string | null;
}) {
	if (pets.length === 0) {
		return (
			<p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground bg-secondary/40">
				No pets yet. Add your first one above.
			</p>
		);
	}
	return (
		<ul className="grid gap-2.5 sm:grid-cols-2">
			{pets.map((pet) => {
				const meta = (
					<div className="flex items-center gap-3 min-w-0">
						<Avatar name={pet.name} size="md" />
						<div className="min-w-0 flex-1">
							<div className="font-display font-semibold leading-tight truncate">
								{pet.name}
							</div>
							<div className="text-xs text-muted-foreground truncate">
								{[pet.species, pet.breed, pet.dob].filter(Boolean).join(" · ")}
							</div>
						</div>
						{pet.enrichment ? (
							<Badge
								variant="outline"
								className="text-[10px] text-muted-foreground shrink-0"
							>
								researched
							</Badge>
						) : null}
					</div>
				);
				return (
					<li key={pet.id} className="min-w-0">
						<div
							className={cn(
								"rounded-2xl bg-card surface surface-hover transition-shadow",
								linkable ? "hover:border-primary/40" : "",
							)}
						>
							<div className="flex items-center justify-between gap-2 p-3">
								{linkable ? (
									<Link
										to="/pet/$petId"
										params={{ petId: pet.id }}
										className="flex-1 min-w-0"
									>
										{meta}
									</Link>
								) : (
									<div className="flex-1 min-w-0">{meta}</div>
								)}
								<div className="flex items-center gap-1 shrink-0">
									{onDelete ? (
										<Button
											size="icon"
											variant="ghost"
											aria-label={`Delete ${pet.name}`}
											disabled={deletingId === pet.id}
											onClick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												onDelete(pet.id, pet.name);
											}}
										>
											<Trash2 className="w-3.5 h-3.5" />
										</Button>
									) : null}
									{linkable ? (
										<ChevronRight className="w-4 h-4 text-muted-foreground" />
									) : null}
								</div>
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
