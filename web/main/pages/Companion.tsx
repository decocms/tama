import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	type CompanionState,
	deriveCompanionStatus,
} from "@/companion/state.ts";
import { usePet, useTimetable } from "../lib/queries.ts";

// Tiny companion view. The PWA manifest points `start_url`
// here so when the app is launched from the dock/home-screen it lands in
// the ambient view rather than the full dashboard.

const STATE_BG: Record<CompanionState, string> = {
	idle: "#fff8ee",
	happy: "#dff5dc",
	hungry: "#fff1d6",
	"pill-time": "#ffe6cf",
	sleeping: "#e6e0f5",
};

function browserTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}

export function CompanionPage() {
	const navigate = useNavigate();
	const { data: pet } = usePet();
	const { data: entries } = useTimetable();

	// Re-tick once a minute so state ("due in 5 minutes" → "overdue") updates
	// without waiting for the next query refetch.
	const [tick, setTick] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setTick((n) => n + 1), 60_000);
		return () => clearInterval(id);
	}, []);

	const status = useMemo(
		() =>
			deriveCompanionStatus({
				entries: entries ?? [],
				petName: pet?.name ?? "Tama",
				summary: pet?.summary ?? null,
				now: new Date(),
				timeZone: pet?.timezone ?? browserTimeZone(),
			}),
		// tick intentionally in deps so we re-derive every minute
		// biome-ignore lint/correctness/useExhaustiveDependencies: tick is the manual re-render trigger
		[entries, pet, tick],
	);

	const openFullDashboard = () => {
		navigate({ to: "/" });
	};

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: tiny ambient surface
		<div
			className="min-h-dvh flex items-center justify-center transition-colors duration-700 select-none"
			style={{ backgroundColor: STATE_BG[status.state] }}
			onDoubleClick={openFullDashboard}
		>
			<div className="flex flex-col items-center gap-5 px-6 text-center">
				<CreatureFace state={status.state} svgPack={pet?.svgPack ?? null} />
				<div className="space-y-1 max-w-xs">
					<div
						className="font-display text-lg font-semibold leading-tight"
						style={{ color: "#2a1f17" }}
					>
						{status.headline}
					</div>
					{status.subline ? (
						<div className="text-xs text-muted-foreground">
							{status.subline}
						</div>
					) : null}
				</div>
				<div className="absolute bottom-4 right-4">
					<Link
						to="/"
						className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
						aria-label="Open full dashboard"
					>
						Dashboard <ArrowUpRight className="w-3 h-3" />
					</Link>
				</div>
				<p className="absolute bottom-4 left-4 text-[10px] text-muted-foreground/70">
					Double-tap to expand
				</p>
			</div>
		</div>
	);
}

function CreatureFace({
	state,
	svgPack,
}: {
	state: CompanionState;
	svgPack: Record<string, string> | null;
}) {
	const svg = svgPack?.[state];
	if (!svg) {
		// No sprite yet (pet not set up) — a soft neutral disc.
		return (
			<div
				className="rounded-full bg-[#e7dfce]"
				style={{ width: 256, height: 256 }}
				aria-label="companion"
			/>
		);
	}
	return (
		<div
			aria-label={`${state}`}
			className="[&>svg]:w-full [&>svg]:h-full"
			style={{
				width: 256,
				height: 256,
				animation: "breathe 2.6s ease-in-out infinite",
			}}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: our own SVG renderer
			dangerouslySetInnerHTML={{ __html: svg }}
		/>
	);
}
