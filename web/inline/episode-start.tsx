import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";
import { formatDateTime } from "@/lib/format.ts";
import type { Episode } from "@/types/api.ts";
import { InlineShell } from "./shell.tsx";

interface Result {
	episode: Episode;
}

export default function EpisodeStartInline() {
	const state = useMcpState<unknown, Result>();
	const app = useMcpApp();
	const ep = state.toolResult?.episode;

	return (
		<InlineShell label="Starting episode">
			{!ep ? (
				<p className="text-sm text-muted-foreground">No episode.</p>
			) : (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							{ep.title}
							<Badge variant={ep.status === "open" ? "default" : "secondary"}>
								{ep.status}
							</Badge>
						</CardTitle>
					</CardHeader>
					<CardContent className="text-sm text-muted-foreground space-y-2">
						<div>Started {formatDateTime(ep.startedAt)}</div>
						{ep.summary ? (
							<p className="whitespace-pre-wrap">{ep.summary}</p>
						) : null}
						<div className="flex gap-2 pt-2">
							<Button
								size="sm"
								onClick={() =>
									app?.sendMessage({
										role: "user",
										content: [
											{
												type: "text",
												text: `Open the dashboard for this episode (call episode_get with episodeId="${ep.id}").`,
											},
										],
									})
								}
							>
								Open dashboard
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
												text: `I have a prescription photo to share for this episode. When I attach it, call prescription_upload with episodeId="${ep.id}".`,
											},
										],
									})
								}
							>
								Add prescription
							</Button>
						</div>
					</CardContent>
				</Card>
			)}
		</InlineShell>
	);
}
