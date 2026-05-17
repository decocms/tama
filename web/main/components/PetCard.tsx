import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import type { Pet } from "@/types/api.ts";

export function PetCard({
	pet,
	onEnrich,
	enriching,
	enrichError,
	children,
}: {
	pet: Pet;
	onEnrich?: () => void;
	enriching?: boolean;
	enrichError?: string | null;
	children?: React.ReactNode;
}) {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						{pet.name}
						<Badge variant="secondary">{pet.species}</Badge>
						{pet.breed ? <Badge variant="outline">{pet.breed}</Badge> : null}
					</CardTitle>
				</CardHeader>
				<CardContent className="text-sm space-y-1">
					{pet.dob ? (
						<div>
							<span className="text-muted-foreground">Age:</span> {pet.dob}
						</div>
					) : null}
					{pet.weightKg ? (
						<div>
							<span className="text-muted-foreground">Weight:</span>{" "}
							{pet.weightKg} kg
						</div>
					) : null}
					{pet.ownerNotes ? (
						<p className="whitespace-pre-wrap">{pet.ownerNotes}</p>
					) : null}
					{onEnrich ? (
						<div className="pt-2">
							<Button
								size="sm"
								variant="outline"
								onClick={onEnrich}
								disabled={enriching}
							>
								<Sparkles className="w-3 h-3" />
								{pet.enrichment
									? enriching
										? "Researching…"
										: "Refresh research"
									: enriching
										? "Researching…"
										: "Research with AI"}
							</Button>
							{enrichError ? (
								<span className="ml-2 text-xs text-destructive">
									{enrichError}
								</span>
							) : null}
						</div>
					) : null}
					{children ? <div className="pt-2">{children}</div> : null}
				</CardContent>
			</Card>

			{pet.enrichment ? <EnrichmentCard enrichment={pet.enrichment} /> : null}
		</div>
	);
}

function EnrichmentCard({
	enrichment,
}: {
	enrichment: NonNullable<Pet["enrichment"]>;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base flex items-center gap-2">
					<Sparkles className="w-4 h-4" /> AI research
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4 text-sm">
				<Section title="Breed">{enrichment.breedNotes}</Section>
				<Section title="Age">{enrichment.ageNotes}</Section>
				<Section title="Current conditions">
					{enrichment.conditionNotes}
				</Section>
				{enrichment.citations.length > 0 ? (
					<div>
						<div className="text-xs uppercase text-muted-foreground mb-1">
							Sources
						</div>
						<ul className="space-y-1">
							{enrichment.citations.map((c) => (
								<li key={c.url}>
									<a
										href={c.url}
										target="_blank"
										rel="noreferrer"
										className="underline text-primary"
									>
										{c.title}
									</a>
								</li>
							))}
						</ul>
					</div>
				) : null}
				<p className="text-xs text-muted-foreground">
					Generated {new Date(enrichment.generatedAt).toLocaleString()}.
				</p>
			</CardContent>
		</Card>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<div className="text-xs uppercase text-muted-foreground mb-1">
				{title}
			</div>
			<p className="whitespace-pre-wrap">{children}</p>
		</div>
	);
}
