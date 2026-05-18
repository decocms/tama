import { Link } from "@tanstack/react-router";
import { PawPrint } from "lucide-react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner.tsx";

export function Layout({
	children,
	breadcrumb,
}: {
	children: ReactNode;
	breadcrumb?: ReactNode;
}) {
	return (
		<div className="min-h-dvh flex flex-col bg-background overflow-x-hidden">
			<header className="border-b border-border/60 bg-background/85 backdrop-blur sticky top-0 z-30">
				<div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
					<Link
						to="/"
						className="inline-flex items-center gap-2 hover:opacity-80"
					>
						<span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center">
							<PawPrint className="w-4 h-4" />
						</span>
						<span className="font-display font-semibold text-lg leading-none">
							myvet
						</span>
					</Link>
					{breadcrumb ? (
						<div className="text-sm text-muted-foreground flex items-center gap-2 min-w-0">
							<span aria-hidden>/</span>
							<span className="truncate">{breadcrumb}</span>
						</div>
					) : null}
				</div>
			</header>
			<main className="flex-1">{children}</main>
			<Toaster position="bottom-right" closeButton richColors />
		</div>
	);
}
