import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	type CompanionState,
	deriveCompanionStatus,
} from "@/companion/state.ts";
import { useEpisode, useEpisodes, usePet } from "../lib/queries.ts";

// Tiny tamagotchi-style companion view. The PWA manifest points `start_url`
// here so when the app is launched from the dock/home-screen it lands in
// the ambient view rather than the full dashboard.

const STATE_TO_CELL: Record<CompanionState, number> = {
	idle: 0,
	happy: 1,
	hungry: 2,
	"pill-time": 3,
	sad: 4,
	sleeping: 5,
};

const STATE_BG: Record<CompanionState, string> = {
	idle: "#fff8ee",
	happy: "#dff5dc",
	hungry: "#fff1d6",
	"pill-time": "#ffe6cf",
	sad: "#fde0e0",
	sleeping: "#e6e0f5",
};

const SPRITE_URL = "/companion-sprite.svg";

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
	const { data: episodes } = useEpisodes();

	// Pick the most-recently-started open episode. Companion is single-episode
	// for v1 — multi-episode aggregation can wait.
	const activeEpisode = useMemo(() => {
		const open = (episodes ?? [])
			.filter((e) => e.status === "open")
			.sort(
				(a, b) =>
					new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
			);
		return open[0] ?? episodes?.[0] ?? null;
	}, [episodes]);

	const { data: dashboard } = useEpisode(activeEpisode?.id);

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
				dashboard: dashboard ?? null,
				petName: pet?.name ?? "Tama",
				now: new Date(),
				timeZone: pet?.timezone ?? browserTimeZone(),
			}),
		// tick intentionally in deps so we re-derive every minute
		// biome-ignore lint/correctness/useExhaustiveDependencies: tick is the manual re-render trigger
		[dashboard, pet, tick],
	);

	const openFullDashboard = () => {
		if (status.openEpisodeId) {
			navigate({
				to: "/episode/$episodeId",
				params: { episodeId: status.openEpisodeId },
			});
		} else {
			navigate({ to: "/" });
		}
	};

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: tiny ambient surface
		<div
			className="min-h-dvh flex items-center justify-center transition-colors duration-700 select-none"
			style={{ backgroundColor: STATE_BG[status.state] }}
			onDoubleClick={openFullDashboard}
		>
			<div className="flex flex-col items-center gap-5 px-6 text-center">
				<CreatureFace state={status.state} />
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

function CreatureFace({ state }: { state: CompanionState }) {
	const cell = STATE_TO_CELL[state];
	return (
		<div
			className="relative"
			aria-label={`Tama is ${state}`}
			style={{
				width: 256,
				height: 256,
				backgroundImage: `url(${SPRITE_URL})`,
				backgroundSize: "1536px 256px",
				backgroundPosition: `${-cell * 256}px 0`,
				imageRendering: "pixelated",
				animation: "tama-breathe 2.4s ease-in-out infinite",
			}}
		>
			{state === "sleeping" ? <SleepingParticles /> : null}
			<style>{`
				@keyframes tama-breathe {
					0%, 100% { transform: translateY(0) scaleY(1); }
					50% { transform: translateY(-2px) scaleY(1.02); }
				}
				@keyframes tama-zfloat {
					0%   { transform: translate(0, 0) rotate(0deg); opacity: 0; }
					20%  { opacity: 0.9; }
					100% { transform: translate(14px, -28px) rotate(15deg); opacity: 0; }
				}
			`}</style>
		</div>
	);
}

function SleepingParticles() {
	return (
		<>
			{[0, 1, 2].map((i) => (
				<span
					key={i}
					className="absolute font-mono font-bold text-[#6b8cc8]"
					style={{
						top: `${30 + i * 8}px`,
						left: `${165 - i * 4}px`,
						fontSize: `${18 - i * 2}px`,
						animation: "tama-zfloat 3.2s ease-out infinite",
						animationDelay: `${i * 0.8}s`,
					}}
				>
					z
				</span>
			))}
		</>
	);
}
