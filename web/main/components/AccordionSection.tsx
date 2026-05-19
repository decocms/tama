import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils.ts";

/**
 * Collapsible section that mirrors the visual hierarchy of `<Section>`
 * (tiny uppercase eyebrow + display-font title + optional action) but
 * starts closed by default. Used for the lower half of the episode page
 * so the user can scan all available areas (Medicines, Prescriptions,
 * Recordings, Notes) at a glance without scrolling through expanded
 * content for everything.
 *
 * Accepts an optional `count` rendered as a subtle badge in the header
 * so the user knows what's inside without expanding.
 */
export function AccordionSection({
	title,
	eyebrow,
	count,
	action,
	defaultOpen = false,
	children,
	className,
}: {
	title: ReactNode;
	eyebrow?: ReactNode;
	count?: number | null;
	action?: ReactNode;
	defaultOpen?: boolean;
	children: ReactNode;
	className?: string;
}) {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<section className={cn("space-y-3", className)}>
			<div className="flex items-center justify-between gap-3">
				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					aria-expanded={open}
					className="flex-1 flex items-center gap-2 text-left group"
				>
					<ChevronDown
						className={cn(
							"w-4 h-4 text-muted-foreground/70 transition-transform group-hover:text-foreground/80",
							open ? "rotate-0" : "-rotate-90",
						)}
					/>
					<div className="flex-1 min-w-0">
						{eyebrow ? (
							<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-0.5">
								{eyebrow}
							</div>
						) : null}
						<div className="flex items-baseline gap-2">
							<h2 className="font-display text-xl font-semibold leading-tight">
								{title}
							</h2>
							{count != null && count > 0 ? (
								<span className="text-xs font-medium tabular-nums text-muted-foreground">
									{count}
								</span>
							) : count === 0 ? (
								<span className="text-xs text-muted-foreground/60">none</span>
							) : null}
						</div>
					</div>
				</button>
				{action && open ? <div className="shrink-0">{action}</div> : null}
			</div>
			{open ? <div className="pl-6">{children}</div> : null}
		</section>
	);
}
