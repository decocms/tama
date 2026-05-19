import {
	AlertTriangle,
	ArrowRight,
	BarChart3,
	RefreshCw,
	Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatDateTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import type { InsightBullet, InsightTag } from "@/types/api.ts";
import { useEpisodeInsights, useRefreshInsights } from "../lib/queries.ts";

const TAG_LABEL: Record<InsightTag, string> = {
	status: "Status",
	"watch-out": "Watch out",
	"next-action": "Next action",
};

const TAG_STYLE: Record<
	InsightTag,
	{
		icon: React.ComponentType<{ className?: string }>;
		color: string;
		tint: string;
	}
> = {
	status: {
		icon: BarChart3,
		color: "text-[var(--color-status-given)]",
		tint: "bg-[var(--color-tint-given)]",
	},
	"watch-out": {
		icon: AlertTriangle,
		color: "text-[var(--color-status-overdue)]",
		tint: "bg-[var(--color-tint-overdue)]",
	},
	"next-action": {
		icon: ArrowRight,
		color: "text-primary",
		tint: "bg-primary/10",
	},
};

export function InsightsPanel({ episodeId }: { episodeId: string }) {
	const { data, isLoading, error } = useEpisodeInsights(episodeId);
	const refresh = useRefreshInsights(episodeId);
	const isRefreshing = refresh.isPending;
	// Hide the status bullet here — it's surfaced in the EpisodeHero instead so
	// the user sees the live status at the very top. This panel focuses on the
	// actionable parts: things to watch out for and concrete next actions.
	const bullets = (data?.insights ?? []).filter((b) => b.tag !== "status");

	return (
		<div className="rounded-2xl surface bg-[color-mix(in_oklab,var(--primary)_4%,var(--color-background-primary))] overflow-hidden">
			<div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60">
				<div className="flex items-center gap-2">
					<div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center">
						<Sparkles className="w-3.5 h-3.5" />
					</div>
					<div>
						<div className="font-display text-base font-semibold leading-tight">
							AI insights
						</div>
						{data?.generatedAt ? (
							<div className="text-[10px] text-muted-foreground">
								Updated {formatDateTime(data.generatedAt)}
								{data.cached ? " · cached" : ""}
							</div>
						) : null}
					</div>
				</div>
				<Button
					size="sm"
					variant="ghost"
					onClick={() => refresh.mutate()}
					disabled={isRefreshing || isLoading}
					className="text-xs"
				>
					<RefreshCw
						className={cn("w-3 h-3", isRefreshing ? "animate-spin" : "")}
					/>
					{isRefreshing ? "Thinking…" : "Refresh"}
				</Button>
			</div>

			<div className="p-4">
				{isLoading || isRefreshing ? (
					<div className="space-y-2.5">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-4/5" />
						<Skeleton className="h-4 w-3/5" />
					</div>
				) : error ? (
					<p className="text-sm text-destructive">
						Couldn't generate insights: {(error as Error).message}
					</p>
				) : bullets.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Nothing notable to flag right now. Refresh later after new notes or
						doses come in.
					</p>
				) : (
					<ul className="space-y-2.5">
						{bullets.map((b, i) => (
							<InsightRow key={`${b.tag}-${i}`} bullet={b} />
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

function InsightRow({ bullet }: { bullet: InsightBullet }) {
	const style = TAG_STYLE[bullet.tag];
	const Icon = style.icon;
	return (
		<li className="flex gap-3 items-start">
			<div
				className={cn(
					"shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5",
					style.tint,
					style.color,
				)}
				aria-hidden
			>
				<Icon className="w-3.5 h-3.5" />
			</div>
			<div className="flex-1 min-w-0">
				<div
					className={cn(
						"text-[10px] uppercase tracking-[0.14em] font-semibold mb-0.5",
						style.color,
					)}
				>
					{TAG_LABEL[bullet.tag]}
				</div>
				<p className="text-sm leading-snug text-foreground/90">{bullet.text}</p>
				{bullet.sourceId ? (
					<div className="text-[10px] text-muted-foreground mt-0.5">
						source: {bullet.sourceKind} · {bullet.sourceId.slice(-6)}
					</div>
				) : (
					<div className="text-[10px] text-muted-foreground mt-0.5">
						from {bullet.sourceKind}
					</div>
				)}
			</div>
		</li>
	);
}
