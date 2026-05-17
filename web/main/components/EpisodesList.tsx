import { Link } from "@tanstack/react-router";
import { ChevronRight, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { formatDate } from "@/lib/format.ts";
import type { Episode } from "@/types/api.ts";

export function EpisodesList({
	episodes,
	linkable = true,
	onDelete,
	deletingId,
}: {
	episodes: Episode[];
	linkable?: boolean;
	onDelete?: (episodeId: string, title: string) => void;
	deletingId?: string | null;
}) {
	if (episodes.length === 0) {
		return <p className="text-sm text-muted-foreground">No episodes yet.</p>;
	}
	return (
		<ul className="space-y-2">
			{episodes.map((ep) => {
				const meta = (
					<>
						<div className="font-medium flex items-center gap-2">
							{ep.title}
							<Badge variant={ep.status === "open" ? "default" : "secondary"}>
								{ep.status}
							</Badge>
						</div>
						<div className="text-xs text-muted-foreground">
							Started {formatDate(ep.startedAt)}
							{ep.endedAt ? ` • Ended ${formatDate(ep.endedAt)}` : ""}
						</div>
					</>
				);
				return (
					<li key={ep.id}>
						<Card
							className={
								linkable ? "hover:bg-accent transition-colors" : undefined
							}
						>
							<CardContent className="flex items-center justify-between p-4 gap-2">
								{linkable ? (
									<Link
										to="/episode/$episodeId"
										params={{ episodeId: ep.id }}
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
											aria-label={`Delete ${ep.title}`}
											disabled={deletingId === ep.id}
											onClick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												onDelete(ep.id, ep.title);
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
