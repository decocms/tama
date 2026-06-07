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
						<div className="text-[11px] uppercase tracking-[0.16em] text-[#b88858] font-bold mb-0.5">
							{eyebrow}
						</div>
					) : null}
					<h2 className="font-display text-xl sm:text-2xl font-bold leading-tight tracking-[-0.01em]">
						{title}
					</h2>
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>
			{children}
		</section>
	);
}
