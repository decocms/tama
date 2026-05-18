import { formatTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";

type Size = "sm" | "md" | "lg" | "xl";
type Tone =
	| "default"
	| "given"
	| "overdue"
	| "muted"
	| "primary"
	| "upcoming";

const sizeClass: Record<Size, string> = {
	sm: "text-xs",
	md: "text-sm",
	lg: "text-lg",
	xl: "text-3xl",
};

const toneClass: Record<Tone, string> = {
	default: "text-foreground",
	given: "text-[var(--color-status-given)]",
	overdue: "text-[var(--color-status-overdue)]",
	muted: "text-muted-foreground",
	primary: "text-primary",
	upcoming: "text-[var(--color-status-upcoming)]",
};

/**
 * Single-line, tabular-figures time display. The hero element across the app —
 * times read first, everything else is supporting metadata.
 */
export function TimeColumn({
	iso,
	size = "md",
	tone = "default",
	className,
}: {
	iso: string;
	size?: Size;
	tone?: Tone;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"font-time tabular-nums whitespace-nowrap",
				sizeClass[size],
				toneClass[tone],
				className,
			)}
		>
			{formatTime(iso)}
		</span>
	);
}
