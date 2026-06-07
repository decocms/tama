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
// `tone` tints the box for overdue (rust) / done (moss); default is ink.
export function TimeBox({
	iso,
	tone = "default",
	timeZone,
}: {
	iso: string;
	tone?: "default" | "overdue" | "done" | "upcoming";
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
		default: { border: "#2a1f17", bg: "#fff8ee", text: "#2a1f17" },
		overdue: { border: "#b7561e", bg: "#fbe7da", text: "#b7561e" },
		done: { border: "#4a7c59", bg: "#e3efe6", text: "#3f6b4d" },
		upcoming: { border: "#2b5ba1", bg: "#e7eef8", text: "#2b5ba1" },
	}[tone];

	return (
		<div
			className="shrink-0 flex flex-col items-center justify-center px-2.5 py-1.5 border-2 min-w-[68px]"
			style={{ borderColor: palette.border, backgroundColor: palette.bg }}
		>
			<span
				className="font-time text-xl font-bold tabular-nums leading-none"
				style={{ color: palette.text }}
			>
				{time}
			</span>
			<span
				className="font-time text-[9px] font-bold tracking-[0.12em] mt-0.5 opacity-70"
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
