import { PawPrint } from "lucide-react";
import { cn } from "@/lib/utils.ts";

type Size = "sm" | "md" | "lg" | "xl";

const dim: Record<Size, { box: string; icon: string }> = {
	sm: { box: "w-8 h-8", icon: "w-4 h-4" },
	md: { box: "w-10 h-10", icon: "w-5 h-5" },
	lg: { box: "w-14 h-14", icon: "w-7 h-7" },
	xl: { box: "w-20 h-20", icon: "w-10 h-10" },
};

// Stable hue per pet name → soft tinted background. Better than a flat grey.
function hashHue(seed: string): number {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
	return Math.abs(h) % 360;
}

export function Avatar({
	name,
	src,
	size = "md",
	className,
}: {
	name: string;
	src?: string | null;
	size?: Size;
	className?: string;
}) {
	const { box, icon } = dim[size];
	const hue = hashHue(name);
	const bg = `hsl(${hue}deg 45% 88%)`;
	const fg = `hsl(${hue}deg 35% 32%)`;

	if (src) {
		return (
			<img
				src={src}
				alt={name}
				className={cn(
					box,
					"rounded-full object-cover border border-border",
					className,
				)}
			/>
		);
	}
	return (
		<div
			className={cn(
				box,
				"rounded-full flex items-center justify-center shrink-0 border border-border/60",
				className,
			)}
			style={{ background: bg, color: fg }}
			role="img"
			aria-label={name}
		>
			<PawPrint className={icon} />
		</div>
	);
}
