import { useMcpState } from "@/context.tsx";
import type { Episode } from "@/types/api.ts";
import { EpisodesList } from "../main/components/EpisodesList.tsx";
import { InlineShell } from "./shell.tsx";

interface Result {
	episodes: Episode[];
}

export default function EpisodeListInline() {
	const state = useMcpState<unknown, Result>();
	const episodes = state.toolResult?.episodes ?? [];
	return (
		<InlineShell label="Listing episodes">
			<h2 className="text-base font-semibold mb-3">Episodes</h2>
			<EpisodesList episodes={episodes} linkable={false} />
		</InlineShell>
	);
}
