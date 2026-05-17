import { Link } from "@tanstack/react-router";
import { ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import type { Pet } from "@/types/api.ts";

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
		return <p className="text-sm text-muted-foreground">No pets yet.</p>;
	}
	return (
		<ul className="space-y-2">
			{pets.map((pet) => {
				const meta = (
					<>
						<div className="font-medium">{pet.name}</div>
						<div className="text-xs text-muted-foreground">
							{[pet.species, pet.breed, pet.dob].filter(Boolean).join(" • ")}
						</div>
					</>
				);
				return (
					<li key={pet.id}>
						<Card
							className={
								linkable ? "hover:bg-accent transition-colors" : undefined
							}
						>
							<CardContent className="flex items-center justify-between p-4 gap-2">
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
								<div className="flex items-center gap-1">
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
							</CardContent>
						</Card>
					</li>
				);
			})}
		</ul>
	);
}
