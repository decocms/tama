import { useMcpState } from "@/context.tsx";
import type { Pet } from "@/types/api.ts";
import { PetCard } from "../main/components/PetCard.tsx";
import { InlineShell } from "./shell.tsx";

interface PetResult {
	pet: Pet | null;
}

export default function PetCardInline({ label }: { label: string }) {
	const state = useMcpState<unknown, PetResult>();
	const pet = state.toolResult?.pet ?? null;
	return (
		<InlineShell label={label}>
			{pet ? (
				<PetCard pet={pet} />
			) : (
				<p className="text-sm text-muted-foreground">Pet not found.</p>
			)}
		</InlineShell>
	);
}
