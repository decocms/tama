import { Button } from "@/components/ui/button.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";
import type { Pet } from "@/types/api.ts";
import { PetCard } from "../main/components/PetCard.tsx";
import { useEnrichPet } from "../main/lib/queries.ts";
import { InlineShell } from "./shell.tsx";

interface PetResult {
	pet: Pet | null;
}

function PetCardInner({ pet }: { pet: Pet }) {
	const app = useMcpApp();
	const enrich = useEnrichPet();

	return (
		<PetCard
			pet={pet}
			onEnrich={() => enrich.mutate()}
			enriching={enrich.isPending}
			enrichError={enrich.error ? (enrich.error as Error).message : null}
		>
			<div className="flex gap-2">
				<Button
					size="sm"
					variant="outline"
					onClick={() =>
						app?.sendMessage({
							role: "user",
							content: [
								{
									type: "text",
									text: `Start a new care episode for ${pet.name}. Ask me for the title and a brief summary first.`,
								},
							],
						})
					}
				>
					Start an episode
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={() =>
						app?.sendMessage({
							role: "user",
							content: [
								{
									type: "text",
									text: `Show me ${pet.name}'s episodes (call episode_list).`,
								},
							],
						})
					}
				>
					List episodes
				</Button>
			</div>
		</PetCard>
	);
}

export default function PetCardInline({ label }: { label: string }) {
	const state = useMcpState<unknown, PetResult>();
	const pet = state.toolResult?.pet ?? null;
	return (
		<InlineShell label={label}>
			{pet ? (
				<PetCardInner pet={pet} />
			) : (
				<p className="text-sm text-muted-foreground">Pet not found.</p>
			)}
		</InlineShell>
	);
}
