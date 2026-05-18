import type { ReactNode } from "react";
import { cn } from "@/lib/utils.ts";

/**
 * Standardized section header: tiny uppercase eyebrow + display-font title +
 * optional right-aligned action slot.
 */
export function Section({
	title,
	eyebrow,
	action,
	children,
	className,
}: {
	title: ReactNode;
	eyebrow?: ReactNode;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("space-y-3", className)}>
			<div className="flex items-end justify-between gap-3">
				<div>
					{eyebrow ? (
						<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-0.5">
							{eyebrow}
						</div>
					) : null}
					<h2 className="font-display text-xl font-semibold leading-tight">
						{title}
					</h2>
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>
			{children}
		</section>
	);
}
