import { useMcpState } from "@/context.tsx";
import type { Pet } from "@/types/api.ts";
import { PetsList } from "../main/components/PetsList.tsx";
import { InlineShell } from "./shell.tsx";

interface Result {
	pets: Pet[];
}

export default function PetListInline() {
	const state = useMcpState<unknown, Result>();
	const pets = state.toolResult?.pets ?? [];
	return (
		<InlineShell label="Listing pets">
			<h2 className="text-base font-semibold mb-3">Pets</h2>
			<PetsList pets={pets} linkable={false} />
		</InlineShell>
	);
}
