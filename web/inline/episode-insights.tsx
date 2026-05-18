import { useMcpState } from "@/context.tsx";
import { InsightsPanel } from "../main/components/InsightsPanel.tsx";
import { InlineShell } from "./shell.tsx";

interface Input {
	episodeId: string;
}

export default function EpisodeInsightsInline() {
	const state = useMcpState<Input, unknown>();
	const episodeId = state.toolInput?.episodeId;
	return (
		<InlineShell label="Loading insights">
			{episodeId ? (
				<InsightsPanel episodeId={episodeId} />
			) : (
				<p className="text-sm text-muted-foreground">No episode id.</p>
			)}
		</InlineShell>
	);
}
