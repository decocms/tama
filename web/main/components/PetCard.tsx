import type { Pet } from "@/types/api.ts";
import { PetHero } from "./PetHero.tsx";

// Thin wrapper around PetHero used by the inline pet-card MCP UI, which also
// renders a children slot (action buttons) underneath the hero card.
export function PetCard({
	pet,
	children,
}: {
	pet: Pet;
	children?: React.ReactNode;
}) {
	return (
		<div className="space-y-3">
			<PetHero pet={pet} />
			{children ? <div>{children}</div> : null}
		</div>
	);
}
