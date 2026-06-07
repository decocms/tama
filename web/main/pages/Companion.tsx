import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import {
	type CompanionState,
	deriveCompanionStatus,
	SETTABLE_STATES,
} from "@/companion/state.ts";
import { cn } from "@/lib/utils.ts";
import { usePet, useSetCompanionState, useTimetable } from "../lib/queries.ts";

// Tiny companion view. The PWA manifest points `start_url` here so when the app
// is launched from the dock/home-screen it lands in the ambient view rather
// than the full dashboard. The owner can SET the mood here (emoji buttons +
// save); live schedule events still override it.

const STATE_BG: Record<CompanionState, string> = {
	idle: "#fff8ee",
	happy: "#dff5dc",
	hungry: "#fff1d6",
	"pill-time": "#ffe6cf",
	sleeping: "#e6e0f5",
	sad: "#fbe9e4",
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
	const setState = useSetCompanionState();

	// A locally-previewed pick before the owner commits it with Save.
	const [pending, setPending] = useState<CompanionState | null>(null);

	// Re-tick once a minute so state ("due in 5 minutes" → "overdue") updates
	// without waiting for the next query refetch.
	const [tick, setTick] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setTick((n) => n + 1), 60_000);
		return () => clearInterval(id);
	}, []);

	const manualState = (pet?.companionState ?? null) as CompanionState | null;
	const manualStateAtMs = pet?.companionStateAt
		? new Date(pet.companionStateAt).getTime()
		: null;

	const status = useMemo(
		() =>
			deriveCompanionStatus({
				entries: entries ?? [],
				petName: pet?.name ?? "Tama",
				manualState,
				manualStateAtMs,
				now: new Date(),
				timeZone: pet?.timezone ?? browserTimeZone(),
			}),
		// tick intentionally in deps so we re-derive every minute
		// biome-ignore lint/correctness/useExhaustiveDependencies: tick is the manual re-render trigger
		[entries, pet, tick],
	);

	const name = pet?.name ?? "Tama";
	const previewing = pending != null && pending !== status.state;
	const displayState = pending ?? status.state;
	const pendingLabel = SETTABLE_STATES.find((s) => s.state === pending)?.label;

	const openFullDashboard = () => navigate({ to: "/" });

	// Esc closes the full-screen view (the browser/phone back button already
	// pops this route since we navigated here).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") openFullDashboard();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
		// biome-ignore lint/correctness/useExhaustiveDependencies: openFullDashboard is stable enough here
	}, []);

	const handleSave = () => {
		if (!pending) return;
		setState.mutate(pending, {
			onSuccess: () => {
				toast.success(`${name} set as ${pendingLabel ?? pending}`);
				setPending(null);
			},
			onError: (e) => toast.error((e as Error).message),
		});
	};

	return (
		<div
			className="min-h-dvh flex flex-col select-none companion-backdrop-in transition-colors duration-700"
			style={{ backgroundColor: STATE_BG[displayState] }}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: tiny ambient surface */}
			<div
				className="flex-1 flex flex-col items-center justify-center gap-4 sm:gap-6 px-6 py-8 text-center companion-stage-in"
				onDoubleClick={openFullDashboard}
			>
				<CreatureFace state={displayState} svgPack={pet?.svgPack ?? null} />

				<div className="space-y-1 max-w-xs">
					<div
						className="font-display text-lg sm:text-xl font-semibold leading-tight"
						style={{ color: "#2a1f17" }}
					>
						{previewing ? `Set ${name} as ${pendingLabel}?` : status.headline}
					</div>
					<div className="text-xs sm:text-sm text-muted-foreground min-h-[1rem]">
						{previewing
							? "Tap Save to make this the current state"
							: (status.subline ?? "")}
					</div>
				</div>

				{/* Mood picker: tap an emoji to preview, then Save to declare it. */}
				<div className="flex flex-col items-center gap-3">
					<div className="flex items-center gap-2 sm:gap-2.5">
						{SETTABLE_STATES.map((s) => {
							const active = displayState === s.state;
							return (
								<button
									key={s.state}
									type="button"
									aria-label={s.label}
									title={s.label}
									onClick={() => setPending(s.state)}
									className={cn(
										"w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-xl border-2 transition-transform",
										active
											? "border-[#2a1f17] bg-white scale-110 shadow-sm"
											: "border-transparent bg-white/55 hover:bg-white hover:scale-105",
									)}
								>
									<span>{s.emoji}</span>
								</button>
							);
						})}
					</div>
					<div className="h-8 flex items-center">
						{previewing ? (
							<div className="flex items-center gap-2">
								<Button
									size="sm"
									onClick={handleSave}
									disabled={setState.isPending}
								>
									{setState.isPending ? "Saving…" : "Save as current"}
								</Button>
								<button
									type="button"
									onClick={() => setPending(null)}
									className="text-xs text-muted-foreground hover:text-foreground"
								>
									Cancel
								</button>
							</div>
						) : null}
					</div>
				</div>
			</div>

			{/* Footer in normal flow (not absolute) so it never crowds the centered
			    content on small screens. */}
			<div className="flex items-center justify-between gap-3 px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground/70">
				<span>Esc or back to close</span>
				<Link
					to="/"
					className="inline-flex items-center gap-1 hover:text-foreground"
					aria-label="Open full dashboard"
				>
					Dashboard <ArrowUpRight className="w-3 h-3" />
				</Link>
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
	// Smaller than before so the mood picker + footer fit on a phone screen.
	const size = "min(58vw, 42vh, 380px)";
	if (!svg) {
		// No sprite yet (pet not set up) — a soft neutral disc.
		return (
			<div
				className="rounded-full bg-[#e7dfce]"
				style={{ width: size, height: size }}
				aria-label="companion"
			/>
		);
	}
	return (
		<div
			aria-label={`${state}`}
			className="[&>svg]:w-full [&>svg]:h-full"
			style={{
				width: size,
				height: size,
				animation: "breathe 2.6s ease-in-out infinite",
			}}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: our own SVG renderer
			dangerouslySetInnerHTML={{ __html: svg }}
		/>
	);
}
