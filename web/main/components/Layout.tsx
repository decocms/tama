import { Link } from "@tanstack/react-router";
import { PawPrint } from "lucide-react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner.tsx";
import { isInIframe } from "../lib/push.ts";
import { usePet } from "../lib/queries.ts";

// Every tab is its own pinnable MCP app (app_pet, app_timeline, …). When the
// bundle is embedded in studio, studio renders one tab per app in its own bar,
// so our in-app header would be a redundant second bar — we hide it. In a
// standalone browser tab there's no studio chrome, so we show the header as the
// app's own navigation.
const NAV = [
	["/", "Pet"],
	["/timeline", "Timeline"],
	["/timetable", "Timetable"],
	["/exams", "Exams"],
	["/research", "Research"],
	["/recordings", "Recordings"],
	["/breathing", "Resp. rate"],
] as const;

/**
 * App shell. In a standalone browser it provides the persistent header
 * (logo + breadcrumb + tab nav). Inside studio (iframe) the header is omitted
 * because studio's pinned-app bar already navigates between the apps.
 */
export function Layout({
	children,
	breadcrumb,
}: {
	children: ReactNode;
	breadcrumb?: ReactNode;
}) {
	// This deploy IS the pet — show its name as the brand (falls back to the
	// template name until the pet row loads / before setup).
	const { data: pet } = usePet();
	const brand = pet?.name?.trim() || "Tama";
	const embedded = isInIframe();

	return (
		<div className="min-h-dvh flex flex-col bg-background overflow-x-hidden">
			{embedded ? null : (
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
							{NAV.map(([to, label]) => (
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
					</div>
				</header>
			)}
			<main className="flex-1">{children}</main>
			<Toaster position="bottom-right" closeButton richColors />
		</div>
	);
}
