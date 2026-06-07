import type { ReactNode } from "react";
import { cn } from "@/lib/utils.ts";

// The app's shared building blocks. Square corners + the flat-graphic surface
// come from globals.css (.surface / .brut + zeroed radius scale); these wrap
// them so every view composes the same pieces instead of re-styling cards
// inline. Reuse these — don't hand-roll `bg-card surface p-4` again.

export function Card({
	children,
	className,
	brut,
}: {
	children: ReactNode;
	className?: string;
	brut?: boolean;
}) {
	return (
		<div className={cn("bg-card p-4 sm:p-5", brut ? "brut" : "surface", className)}>
			{children}
		</div>
	);
}

// A list row. `interactive` adds the hover affordance for clickable rows.
export function Row({
	children,
	className,
	interactive,
}: {
	children: ReactNode;
	className?: string;
	interactive?: boolean;
}) {
	return (
		<div
			className={cn(
				"bg-card surface p-3 flex items-center gap-3",
				interactive && "surface-hover cursor-pointer transition-shadow",
				className,
			)}
		>
			{children}
		</div>
	);
}

// Prominent time block: 24h digital-clock face on the left of a schedule row.
// `tone` tints it — overdue (rust), soon ≤1h (saffron), done (moss); the
// resting "upcoming" is a calm warm-neutral (not a loud blue).
export type TimeBoxTone = "upcoming" | "soon" | "overdue" | "done" | "default";

export function TimeBox({
	iso,
	tone = "upcoming",
	timeZone,
}: {
	iso: string;
	tone?: TimeBoxTone;
	timeZone?: string;
}) {
	const d = new Date(iso);
	const time = d.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone,
	});
	const day = d
		.toLocaleDateString(undefined, { weekday: "short", timeZone })
		.toUpperCase();

	const palette = {
		default: { border: "#d8c9ad", bg: "#fffaf0", text: "#2a1f17" },
		upcoming: { border: "#d8c9ad", bg: "#fffaf0", text: "#2a1f17" },
		soon: { border: "#c08a1e", bg: "#faf0d2", text: "#8a6310" },
		overdue: { border: "#b7561e", bg: "#fbe7da", text: "#b7561e" },
		done: { border: "#7fae8c", bg: "#e9f1ea", text: "#3f6b4d" },
	}[tone];

	return (
		<div
			className="shrink-0 flex flex-col items-center justify-center py-1.5 sm:py-2 border-2 w-[84px] sm:w-[104px]"
			style={{ borderColor: palette.border, backgroundColor: palette.bg }}
		>
			{/* DS-Digital isn't monospaced, so lay each glyph in an equal-width
			    cell — every time is exactly 5 cells wide, so the boxes match. */}
			<span
				className="font-digital text-2xl sm:text-3xl leading-none flex"
				style={{ color: palette.text }}
			>
				{time.split("").map((ch, i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed-position clock glyphs
						key={i}
						className="inline-block text-center"
						style={{ width: "0.62em" }}
					>
						{ch}
					</span>
				))}
			</span>
			<span
				className="font-time text-[9px] sm:text-[10px] font-bold tracking-[0.16em] mt-1 sm:mt-1.5 opacity-55"
				style={{ color: palette.text }}
			>
				{day}
			</span>
		</div>
	);
}

// Soft pastel pill. `bg` is a landing pastel hex; default warm cream.
export function Pill({
	children,
	bg,
	className,
}: {
	children: ReactNode;
	bg?: string;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"text-sm px-3 py-1 rounded-full border border-[#2a1f17]/12 font-medium text-[#2a1f17]",
				className,
			)}
			style={{ backgroundColor: bg ? `${bg}99` : "#fff8eecc" }}
		>
			{children}
		</span>
	);
}
