import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	type CompanionState,
	deriveCompanionStatus,
} from "@/companion/state.ts";
import type { SpritePack } from "@/types/api.ts";
import { usePet, useTimetable } from "../lib/queries.ts";

// Tiny pixel-companion view. The PWA manifest points `start_url`
// here so when the app is launched from the dock/home-screen it lands in
// the ambient view rather than the full dashboard.

const STATE_TO_CELL: Record<CompanionState, number> = {
	idle: 0,
	happy: 1,
	hungry: 2,
	"pill-time": 3,
	sleeping: 4,
};

const STATE_TO_PACK_KEY: Record<CompanionState, keyof SpritePack> = {
	idle: "idle",
	happy: "happy",
	hungry: "hungry",
	"pill-time": "pill-time",
	sleeping: "sleeping",
};

const STATE_BG: Record<CompanionState, string> = {
	idle: "#fff8ee",
	happy: "#dff5dc",
	hungry: "#fff1d6",
	"pill-time": "#ffe6cf",
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
				<CreatureFace state={status.state} pack={pet?.spritePack ?? null} />
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
	pack,
}: {
	state: CompanionState;
	pack: SpritePack | null;
}) {
	const cell = STATE_TO_CELL[state];
	// Prefer the AI-generated per-pet pack when available, fall back to the
	// static 6-cell placeholder sheet baked into public/.
	const usingPack = pack != null && pack[STATE_TO_PACK_KEY[state]];
	const bgStyle = usingPack
		? {
				backgroundImage: `url(${pack[STATE_TO_PACK_KEY[state]]})`,
				backgroundSize: "256px 256px",
				backgroundPosition: "0 0",
				backgroundRepeat: "no-repeat" as const,
			}
		: {
				backgroundImage: `url(${SPRITE_URL})`,
				backgroundSize: "1536px 256px",
				backgroundPosition: `${-cell * 256}px 0`,
			};
	return (
		<div
			className="relative"
			aria-label={`Tama is ${state}`}
			style={{
				width: 256,
				height: 256,
				...bgStyle,
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
