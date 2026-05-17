import { Link } from "@tanstack/react-router";
import { PawPrint } from "lucide-react";
import type { ReactNode } from "react";

export function Layout({
	children,
	breadcrumb,
}: {
	children: ReactNode;
	breadcrumb?: ReactNode;
}) {
	return (
		<div className="min-h-dvh flex flex-col">
			<header className="border-b">
				<div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
					<Link
						to="/"
						className="flex items-center gap-2 font-semibold text-base hover:opacity-80"
					>
						<PawPrint className="w-4 h-4" />
						myvet
					</Link>
					{breadcrumb ? (
						<div className="text-sm text-muted-foreground flex items-center gap-2">
							<span>/</span>
							{breadcrumb}
						</div>
					) : null}
				</div>
			</header>
			<main className="flex-1">{children}</main>
		</div>
	);
}
