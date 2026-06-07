import { Link } from "@tanstack/react-router";
import { ChevronRight, FlaskConical, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { PetProfile } from "@/types/api.ts";
import { Layout } from "../components/Layout.tsx";
import { PetHero } from "../components/PetHero.tsx";
import { useExams, usePet, useRefreshProfile } from "../lib/queries.ts";

// The Pet app: profile, the pet sheet, the evolving health summary, the
// companion (tap the avatar), and a shortcut to exams. Assets live in their own
// app now; the life itself lives on the Timeline. No episodes.
export function PetPage() {
	const { data: pet, isLoading } = usePet();
	const { data: exams } = useExams();
	const refreshProfile = useRefreshProfile();

	return (
		<Layout>
			<div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
				{isLoading || !pet ? (
					<>
						<Skeleton className="h-44 w-full rounded-2xl" />
						<Skeleton className="h-24 w-full rounded-xl" />
					</>
				) : (
					<>
						<PetHero pet={pet} />

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

						<ExamsCard
							confirmedCount={
								(exams ?? []).filter((e) => e.status === "confirmed").length
							}
							draftCount={(exams ?? []).filter((e) => e.status === "draft").length}
						/>
					</>
				)}
			</div>
		</Layout>
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
	const groups: { label: string; items: string[]; tint: string }[] = profile
		? [
				{
					label: "Allergies",
					items: profile.allergies ?? [],
					tint: "var(--color-tint-overdue)",
				},
				{
					label: "Chronic",
					items: profile.chronicConditions ?? [],
					tint: "var(--color-tint-med)",
				},
				{
					label: "Active concerns",
					items: profile.activeConcerns ?? [],
					tint: "var(--color-tint-upcoming)",
				},
				{
					label: "Medications",
					items: profile.medications ?? [],
					tint: "var(--color-tint-given)",
				},
				{
					label: "Watch for",
					items: profile.watchFor ?? [],
					tint: "var(--color-tint-pet)",
				},
				{
					label: "Past episodes",
					items: profile.pastEpisodes ?? [],
					tint: "var(--color-tint-meal)",
				},
			].filter((g) => g.items.length > 0)
		: [];

	return (
		<div className="rounded-2xl bg-card surface p-5">
			<div className="flex items-start justify-between gap-3 mb-2">
				<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
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
				<div className="space-y-3">
					{profile.oneLiner ? (
						<p className="text-sm font-medium text-foreground">
							{profile.oneLiner}
						</p>
					) : null}
					<div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
						{profile.ageText ? <Fact>{profile.ageText}</Fact> : null}
						{profile.weightKg ? <Fact>{profile.weightKg} kg</Fact> : null}
						{profile.sex ? <Fact>{profile.sex}</Fact> : null}
						{profile.diet ? <Fact>Diet: {profile.diet}</Fact> : null}
					</div>
					{groups.map((g) => (
						<div key={g.label}>
							<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1">
								{g.label}
							</div>
							<div className="flex flex-wrap gap-1.5">
								{g.items.map((it) => (
									<span
										key={it}
										className="text-xs px-2 py-0.5 rounded-full border border-border/70"
										style={{ backgroundColor: g.tint }}
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
		<span className="px-2 py-0.5 rounded-full bg-secondary/60 border border-border/60">
			{children}
		</span>
	);
}

function ExamsCard({
	confirmedCount,
	draftCount,
}: {
	confirmedCount: number;
	draftCount: number;
}) {
	const total = confirmedCount + draftCount;
	return (
		<Link
			to="/exams"
			className="block rounded-2xl bg-card surface p-4 hover:border-primary/30 transition-colors"
		>
			<div className="flex items-center gap-3">
				<div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center">
					<FlaskConical className="w-4 h-4" />
				</div>
				<div className="flex-1 min-w-0">
					<div className="font-display text-base font-semibold leading-tight">
						Lab exams
					</div>
					<div className="text-xs text-muted-foreground">
						{total === 0
							? "No exams yet — upload one in Assets or here."
							: `${confirmedCount} confirmed${draftCount ? ` · ${draftCount} draft` : ""} — see evolution charts`}
					</div>
				</div>
				<ChevronRight className="w-4 h-4 text-muted-foreground" />
			</div>
		</Link>
	);
}

