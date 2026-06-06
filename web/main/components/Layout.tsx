import { Link } from "@tanstack/react-router";
import { PawPrint, Wind } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import { usePet } from "../lib/queries.ts";
import { BreathingCounter } from "./BreathingCounter.tsx";

/**
 * App shell. Provides the persistent header (logo + breadcrumb + tools)
 * and mounts the breathing-rate tool globally so it's reachable from any
 * page via the wind-icon button in the topbar.
 */
export function Layout({
	children,
	breadcrumb,
}: {
	children: ReactNode;
	breadcrumb?: ReactNode;
}) {
	const [breathingOpen, setBreathingOpen] = useState(false);
	// This deploy IS the pet — show its name as the brand (falls back to the
	// template name until the pet row loads / before setup).
	const { data: pet } = usePet();
	const brand = pet?.name?.trim() || "Tama";

	return (
		<div className="min-h-dvh flex flex-col bg-background overflow-x-hidden">
			<header className="bg-background/85 backdrop-blur sticky top-0 z-30 shadow-[0_1px_0_rgba(31,26,20,0.06)]">
				<div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
					<Link
						to="/"
						className="inline-flex items-center gap-2 hover:opacity-80"
					>
						<span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center">
							<PawPrint className="w-4 h-4" />
						</span>
						<span className="font-display font-semibold text-lg leading-none">
							{brand}
						</span>
					</Link>
					{breadcrumb ? (
						<div className="text-sm text-muted-foreground flex items-center gap-2 min-w-0">
							<span aria-hidden>/</span>
							<span className="truncate">{breadcrumb}</span>
						</div>
					) : null}
					<nav className="ml-auto flex items-center gap-1 text-sm">
						{(
							[
								["/", "Pet"],
								["/timeline", "Timeline"],
								["/timetable", "Timetable"],
								["/exams", "Exams"],
								["/research", "Research"],
								["/recordings", "Recordings"],
							] as const
						).map(([to, label]) => (
							<Link
								key={to}
								to={to}
								className="px-2.5 py-1.5 rounded-full hover:bg-primary/10 [&.active]:bg-primary/15 [&.active]:text-primary font-medium"
								activeOptions={{ exact: to === "/" }}
							>
								{label}
							</Link>
						))}
					</nav>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="rounded-full h-9 px-3 gap-1.5 text-foreground/85 hover:text-foreground hover:bg-primary/10"
							onClick={() => setBreathingOpen(true)}
							aria-label="Open respiratory rate tool"
							title="Respiratory rate"
						>
							<Wind className="w-4 h-4" />
							<span className="text-xs font-medium hidden sm:inline">
								Resp. rate
							</span>
						</Button>
					</div>
				</div>
			</header>
			<main className="flex-1">{children}</main>
			<BreathingCounter
				open={breathingOpen}
				onClose={() => setBreathingOpen(false)}
			/>
			<Toaster position="bottom-right" closeButton richColors />
		</div>
	);
}
