import { Link } from "@tanstack/react-router";
import {
	ChevronRight,
	FileText,
	FlaskConical,
	RefreshCw,
	Sprout,
	Upload,
} from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatDateTime } from "@/lib/format.ts";
import type { Asset, PetProfile } from "@/types/api.ts";
import { Layout } from "../components/Layout.tsx";
import { PetHero } from "../components/PetHero.tsx";
import { Section } from "../components/Section.tsx";
import {
	useAssets,
	useExams,
	usePet,
	useRefreshProfile,
	useUploadAsset,
} from "../lib/queries.ts";

// The Pet app: profile, the one evolving health summary, the companion link,
// the Assets library (drop anything → it's filed into the timeline), and a
// shortcut to exams. No episodes — the life lives on the Timeline.
export function PetPage() {
	const { data: pet, isLoading } = usePet();
	const { data: exams } = useExams();
	const { data: assets } = useAssets();
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

						<CompanionLinkCard petName={pet.name} />

						<ExamsCard
							confirmedCount={
								(exams ?? []).filter((e) => e.status === "confirmed").length
							}
							draftCount={(exams ?? []).filter((e) => e.status === "draft").length}
						/>

						<AssetsCard assets={assets ?? []} />
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

function CompanionLinkCard({ petName }: { petName: string }) {
	return (
		<Link
			to="/companion"
			className="block rounded-2xl bg-card surface p-4 hover:border-primary/30 transition-colors"
		>
			<div className="flex items-center gap-3">
				<div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center">
					<Sprout className="w-4 h-4" />
				</div>
				<div className="flex-1 min-w-0">
					<div className="font-display text-base font-semibold leading-tight">
						Open {petName}
					</div>
					<div className="text-xs text-muted-foreground">
						The ambient pixel view — add it to your home screen.
					</div>
				</div>
				<ChevronRight className="w-4 h-4 text-muted-foreground" />
			</div>
		</Link>
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

function AssetsCard({ assets }: { assets: Asset[] }) {
	const upload = useUploadAsset();
	const inputRef = useRef<HTMLInputElement>(null);

	const handleFile = async (file: File) => {
		try {
			const buf = await file.arrayBuffer();
			const bytes = new Uint8Array(buf);
			let binary = "";
			const chunk = 0x8000;
			for (let i = 0; i < bytes.length; i += chunk) {
				binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
			}
			const result = await upload.mutateAsync({
				imageBase64: btoa(binary),
				mimeType: file.type || "application/octet-stream",
				originalName: file.name,
			});
			toast.success(`Filed as ${result.assetType.replace("_", " ")}`);
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	return (
		<Section
			title="Assets"
			eyebrow={`${assets.length} files`}
			action={
				<>
					<input
						ref={inputRef}
						type="file"
						accept="image/*,application/pdf"
						className="sr-only"
						disabled={upload.isPending}
						onChange={(e) => {
							const f = e.target.files?.[0];
							if (f) handleFile(f);
							e.target.value = "";
						}}
					/>
					<Button
						size="sm"
						disabled={upload.isPending}
						onClick={() => inputRef.current?.click()}
					>
						<Upload className="w-3.5 h-3.5" />
						{upload.isPending ? "Filing…" : "Upload"}
					</Button>
				</>
			}
		>
			<p className="text-xs text-muted-foreground mb-3">
				Drop any document, lab report, vaccine card, or photo — the agent
				files it into the timeline automatically.
			</p>
			{assets.length === 0 ? (
				<p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground bg-secondary/40">
					Nothing uploaded yet.
				</p>
			) : (
				<div className="space-y-2">
					{assets.map((a) => (
						<a
							key={a.id}
							href={`/api/files/${a.id}`}
							target="_blank"
							rel="noreferrer"
							className="flex items-center gap-3 rounded-xl bg-card surface p-3 hover:border-primary/30 transition-colors"
						>
							<FileText className="w-4 h-4 text-muted-foreground shrink-0" />
							<span className="flex-1 min-w-0 truncate text-sm">
								{a.originalName ?? a.id}
							</span>
							<span className="text-[10px] text-muted-foreground">
								{formatDateTime(a.uploadedAt)}
							</span>
						</a>
					))}
				</div>
			)}
		</Section>
	);
}
