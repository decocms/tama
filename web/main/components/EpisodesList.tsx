import { Link } from "@tanstack/react-router";
import { ChevronRight, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { daysSince, formatDate } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
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
		return (
			<p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground bg-secondary/40">
				No episodes yet. Start one to begin tracking treatment.
			</p>
		);
	}
	return (
		<ul className="space-y-2.5">
			{episodes.map((ep) => {
				const isOpen = ep.status === "open";
				const day = daysSince(ep.startedAt);
				const meta = (
					<>
						<div className="flex items-center gap-2 flex-wrap">
							<h3 className="font-display font-semibold leading-tight truncate">
								{ep.title}
							</h3>
							<Badge
								variant={isOpen ? "default" : "secondary"}
								className={cn(
									"text-[10px] uppercase tracking-wider",
									isOpen
										? "bg-[var(--color-status-given)] text-white border-transparent"
										: "",
								)}
							>
								{ep.status}
							</Badge>
						</div>
						<div className="text-xs text-muted-foreground mt-0.5">
							Started {formatDate(ep.startedAt)}
							{isOpen ? ` · day ${day}` : ""}
							{ep.endedAt ? ` · Ended ${formatDate(ep.endedAt)}` : ""}
						</div>
					</>
				);
				return (
					<li key={ep.id}>
						<div
							className={cn(
								"rounded-xl border bg-card transition-colors",
								linkable ? "hover:border-primary/40" : "",
							)}
						>
							<div className="flex items-center justify-between gap-2 p-4">
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
								<div className="flex items-center gap-1 shrink-0">
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
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
