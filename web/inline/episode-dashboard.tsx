import { useMcpState } from "@/context.tsx";
import type { EpisodeDashboardResult } from "@/types/api.ts";
import { EpisodeView } from "../main/components/EpisodeView.tsx";
import { InlineShell } from "./shell.tsx";

interface Input {
	episodeId: string;
}

export default function EpisodeDashboardInline() {
	const state = useMcpState<Input, EpisodeDashboardResult>();
	// Prefer the toolInput.episodeId (always present), fall back to result.
	const episodeId = state.toolInput?.episodeId ?? state.toolResult?.episode?.id;

	return (
		<InlineShell label="Loading episode">
			{episodeId ? (
				<EpisodeView episodeId={episodeId} />
			) : (
				<p className="text-sm text-muted-foreground">No episode id.</p>
			)}
		</InlineShell>
	);
}
