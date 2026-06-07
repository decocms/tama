import { Link } from "@tanstack/react-router";
import { ChevronRight, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { PetProfile, TimetableEntry } from "@/types/api.ts";
import { TimeBox } from "../components/Card.tsx";
import { Layout } from "../components/Layout.tsx";
import { PetHero } from "../components/PetHero.tsx";
import { usePet, useRefreshProfile, useTimetable } from "../lib/queries.ts";

// The Pet app: profile, a live timetable-status line, the pet sheet, and the
// companion (tap the avatar). Exams, Assets, etc. are their own apps now; the
// life itself lives on the Timeline. No episodes.
export function PetPage() {
	const { data: pet, isLoading: petLoading } = usePet();
	// Load the timetable here too and gate the whole page on BOTH — otherwise
	// the hero avatar and the status card would each fetch on their own and pop
	// in a beat after the skeleton clears. One skeleton, then the finished view.
	const { data: entries, isPending: ttPending } = useTimetable();
	const refreshProfile = useRefreshProfile();
	const loading = petLoading || ttPending || !pet;

	return (
		<Layout>
			<div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
				{loading ? (
					<>
						<Skeleton className="h-44 w-full rounded-2xl" />
						<Skeleton className="h-[72px] w-full rounded-2xl" />
						<Skeleton className="h-64 w-full rounded-2xl" />
					</>
				) : (
					<>
						<PetHero pet={pet} entries={entries ?? []} />

						<TimetableStatusCard entries={entries ?? []} />

						<CaseFileCard
							profile={pet.profile ?? null}
							refreshing={refreshProfile.isPending}
							onRefresh={() =>
								refreshProfile.mutate(undefined, {
									onSuccess: () => toast.success("Pet sheet updated"),
									onError: (e) => toast.error((e as Error).message),
								})
							}
						/>
					</>
				)}
			</div>
		</Layout>
	);
}

// Live "what's next / what's overdue" line, linking into the Timetable app.
// Studio has no app→host navigation, so this is an in-bundle hash link: in a
// pinned Pet tile it swaps that tile to the timetable; standalone it just
// routes. Either way the owner gets there in one tap.
function TimetableStatusCard({ entries }: { entries: TimetableEntry[] }) {
	const now = Date.now();
	const pending = entries.filter((e) => e.status === "pending");
	const overdue = pending
		.filter((e) => new Date(e.scheduledAt).getTime() < now)
		.sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));
	const upcoming = pending
		.filter((e) => new Date(e.scheduledAt).getTime() >= now)
		.sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));

	const featured = overdue[0] ?? upcoming[0] ?? null;
	const soon =
		upcoming[0] &&
		new Date(upcoming[0].scheduledAt).getTime() - now <= 60 * 60 * 1000;
	const tboxTone: "overdue" | "soon" | "upcoming" =
		overdue.length > 0 ? "overdue" : soon ? "soon" : "upcoming";

	let headline = "All caught up";
	let detail = "Nothing due in the window.";
	if (overdue.length > 0) {
		const first = overdue[0] as TimetableEntry;
		if (overdue.length === 1) {
			// Headline already names it — don't repeat in the detail.
			headline = `${first.itemName} is overdue`;
			detail = first.dosage ?? "Tap to open the timetable";
		} else {
			headline = `${overdue.length} doses overdue`;
			detail = `${first.itemName}${first.dosage ? ` · ${first.dosage}` : ""} + ${overdue.length - 1} more`;
		}
	} else if (upcoming.length > 0) {
		const first = upcoming[0] as TimetableEntry;
		headline = `Next: ${first.itemName}`;
		detail = first.dosage ?? "Tap to open the timetable";
	}

	return (
		<Link
			to="/timetable"
			className="block bg-card surface surface-hover p-4 transition-shadow"
		>
			<div className="flex items-center gap-3">
				{featured ? (
					<TimeBox iso={featured.scheduledAt} tone={tboxTone} />
				) : (
					<div className="shrink-0 w-[68px] flex items-center justify-center">
						<div className="w-9 h-9 rounded-full flex items-center justify-center bg-[#e3efe6] text-[#3f6b4d]">
							<Clock className="w-4 h-4" />
						</div>
					</div>
				)}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-[11px] uppercase tracking-[0.14em] text-[#b88858] font-bold">
							Timetable
						</span>
						{overdue.length > 0 ? (
							<span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#fbe7da] text-[#b7561e]">
								Overdue
							</span>
						) : null}
					</div>
					<div className="font-display text-base sm:text-lg font-bold leading-tight truncate">
						{headline}
					</div>
					<div className="text-sm text-muted-foreground truncate">{detail}</div>
				</div>
				<ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
			</div>
		</Link>
	);
}

// The structured "pet sheet" — the RPG-style overview of the pet's medical
// reality, synthesized by pet_profile_refresh and used as AI context.
function CaseFileCard({
	profile,
	refreshing,
	onRefresh,
}: {
	profile: PetProfile | null;
	refreshing: boolean;
	onRefresh: () => void;
}) {
	// Bright landing-palette pastels per category (cream/peach/mint/lavender/
	// rose), with dark ink text — legible and lively, unlike the old ~8%-opacity
	// tints that washed out. `ink` text reads on every pastel and in dark mode.
	// Each section is a colored, bulleted list (no pills) — a scannable chart of
	// the case. Diet is its own section alongside allergies/chronic/etc.
	const groups: { label: string; items: string[]; color: string }[] = profile
		? [
				{ label: "Alergias", items: profile.allergies ?? [], color: "#c0492b" },
				{
					label: "Crônico",
					items: profile.chronicConditions ?? [],
					color: "#b07d1a",
				},
				{
					label: "Em aberto",
					items: profile.activeConcerns ?? [],
					color: "#c2410c",
				},
				{
					label: "Dieta",
					items: profile.diet ? [profile.diet] : [],
					color: "#0f766e",
				},
				{
					label: "Medicações",
					items: profile.medications ?? [],
					color: "#2f6b4d",
				},
				{ label: "De olho em", items: profile.watchFor ?? [], color: "#7c5cc4" },
				{
					label: "Episódios passados",
					items: profile.pastEpisodes ?? [],
					color: "#8a6f4a",
				},
			].filter((g) => g.items.length > 0)
		: [];

	const meta = profile
		? [
				profile.ageText,
				profile.weightKg ? `${profile.weightKg} kg` : null,
				profile.sex,
			].filter(Boolean)
		: [];

	return (
		<div className="bg-card surface p-5 sm:p-6">
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="text-xs uppercase tracking-[0.14em] text-[#b88858] font-bold">
					Pet sheet
				</div>
				<Button
					size="sm"
					variant="ghost"
					onClick={onRefresh}
					disabled={refreshing}
					className="h-7 gap-1.5 text-xs"
				>
					<RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
					{refreshing ? "Thinking…" : profile ? "Rebuild" : "Generate"}
				</Button>
			</div>

			{!profile ? (
				<p className="text-sm text-foreground/70 leading-relaxed">
					A structured overview — age, weight, allergies, chronic conditions,
					active concerns, meds, what to watch — built from the timeline and
					exams. It's the context the AI uses for research and analysis. Hit{" "}
					<strong>Generate</strong> to build it.
				</p>
			) : (
				<div className="space-y-4">
					{profile.oneLiner ? (
						<p className="text-base font-semibold text-foreground leading-relaxed">
							{profile.oneLiner}
						</p>
					) : null}
					{meta.length ? (
						<div className="text-sm font-medium text-muted-foreground">
							{meta.join("  ·  ")}
						</div>
					) : null}
					<div className="space-y-5">
						{groups.map((g) => (
							<div
								key={g.label}
								className="pl-3 border-l-[3px]"
								style={{ borderColor: g.color }}
							>
								<div
									className="text-[13px] uppercase tracking-[0.12em] font-bold mb-1.5"
									style={{ color: g.color }}
								>
									{g.label}
								</div>
								<ul className="space-y-1">
									{g.items.map((it) => (
										<li
											key={it}
											className="flex gap-2.5 text-sm leading-snug text-foreground/85"
										>
											<span
												className="mt-[6px] w-1.5 h-1.5 shrink-0"
												style={{ backgroundColor: g.color }}
											/>
											<span>{it}</span>
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

