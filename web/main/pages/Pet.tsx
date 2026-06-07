import { Link } from "@tanstack/react-router";
import { ChevronRight, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { PetProfile, TimetableEntry } from "@/types/api.ts";
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
function fmtWhen(iso: string): string {
	return new Date(iso).toLocaleString(undefined, {
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function TimetableStatusCard({ entries }: { entries: TimetableEntry[] }) {
	const now = Date.now();
	const pending = entries.filter((e) => e.status === "pending");
	const overdue = pending
		.filter((e) => new Date(e.scheduledAt).getTime() < now)
		.sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));
	const upcoming = pending
		.filter((e) => new Date(e.scheduledAt).getTime() >= now)
		.sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));

	let tone: "overdue" | "upcoming" | "clear" = "clear";
	let headline = "All caught up";
	let detail = "Nothing due in the window.";
	if (overdue.length > 0) {
		const first = overdue[0] as TimetableEntry;
		tone = "overdue";
		headline =
			overdue.length === 1
				? `${first.itemName} is overdue`
				: `${overdue.length} doses overdue`;
		detail = `${first.itemName}${first.dosage ? ` · ${first.dosage}` : ""} — was due ${fmtWhen(first.scheduledAt)}`;
	} else if (upcoming.length > 0) {
		const first = upcoming[0] as TimetableEntry;
		tone = "upcoming";
		headline = `Next: ${first.itemName}`;
		detail = `${first.dosage ? `${first.dosage} · ` : ""}${fmtWhen(first.scheduledAt)}`;
	}

	const dot =
		tone === "overdue"
			? "var(--color-status-overdue,#dc2626)"
			: tone === "upcoming"
				? "var(--color-accent-med,#2563eb)"
				: "var(--color-accent-given,#16a34a)";

	return (
		<Link
			to="/timetable"
			className="block rounded-2xl bg-card surface p-4 hover:border-primary/30 transition-colors"
		>
			<div className="flex items-center gap-3">
				<div
					className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
					style={{ backgroundColor: `${dot}1a`, color: dot }}
				>
					<Clock className="w-4 h-4" />
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
							Timetable
						</span>
						{overdue.length > 0 ? (
							<span
								className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
								style={{ backgroundColor: `${dot}1a`, color: dot }}
							>
								Overdue
							</span>
						) : null}
					</div>
					<div className="font-display text-base font-semibold leading-tight truncate">
						{headline}
					</div>
					<div className="text-xs text-muted-foreground truncate">{detail}</div>
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
	const groups: { label: string; items: string[]; bg: string }[] = profile
		? [
				{ label: "Allergies", items: profile.allergies ?? [], bg: "#fde0e0" },
				{
					label: "Chronic",
					items: profile.chronicConditions ?? [],
					bg: "#fff1d6",
				},
				{
					label: "Active concerns",
					items: profile.activeConcerns ?? [],
					bg: "#ffbd8e",
				},
				{
					label: "Medications",
					items: profile.medications ?? [],
					bg: "#b6e3c8",
				},
				{ label: "Watch for", items: profile.watchFor ?? [], bg: "#c9b6f0" },
				{
					label: "Past episodes",
					items: profile.pastEpisodes ?? [],
					bg: "#e6ddca",
				},
			].filter((g) => g.items.length > 0)
		: [];

	return (
		<div className="rounded-2xl bg-card surface p-5 sm:p-6">
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
					<div className="flex flex-wrap gap-2">
						{profile.ageText ? <Fact>{profile.ageText}</Fact> : null}
						{profile.weightKg ? <Fact>{profile.weightKg} kg</Fact> : null}
						{profile.sex ? <Fact>{profile.sex}</Fact> : null}
						{profile.diet ? <Fact>Diet: {profile.diet}</Fact> : null}
					</div>
					{groups.map((g) => (
						<div key={g.label}>
							<div className="text-[11px] uppercase tracking-[0.12em] text-foreground/60 font-bold mb-1.5">
								{g.label}
							</div>
							<div className="flex flex-wrap gap-2">
								{g.items.map((it) => (
									<span
										key={it}
										className="text-sm leading-snug px-3 py-1.5 rounded-full border border-[#2a1f17]/10 font-medium text-[#2a1f17]"
										// ~60% over the cream card → softer pastel, dark text stays legible.
										style={{ backgroundColor: `${g.bg}99` }}
									>
										{it}
									</span>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function Fact({ children }: { children: React.ReactNode }) {
	return (
		<span className="text-sm px-3 py-1.5 rounded-full bg-[#fbeede] border border-[#2a1f17]/12 font-medium text-foreground/80">
			{children}
		</span>
	);
}

