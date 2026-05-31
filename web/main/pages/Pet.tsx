import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronRight, FlaskConical, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatDateTime } from "@/lib/format.ts";
import type { Enrichment } from "@/types/api.ts";
import { EpisodesList } from "../components/EpisodesList.tsx";
import { Layout } from "../components/Layout.tsx";
import { PetHero } from "../components/PetHero.tsx";
import { Section } from "../components/Section.tsx";
import {
	useDeleteEpisode,
	useEnrichPet,
	useEpisodes,
	useExamsForPet,
	usePet,
	useStartEpisode,
} from "../lib/queries.ts";

export function PetPage() {
	const { petId } = useParams({ from: "/pet/$petId" });
	const navigate = useNavigate();
	const { data: pet, isLoading } = usePet(petId);
	const { data: episodes } = useEpisodes(petId);
	const { data: exams } = useExamsForPet(petId);
	const enrich = useEnrichPet(petId);
	const startEp = useStartEpisode();
	const delEp = useDeleteEpisode();
	const [showForm, setShowForm] = useState(false);

	const handleDeleteEpisode = (episodeId: string, title: string) => {
		if (
			!window.confirm(
				`Hide episode "${title}"? Notes, prescriptions, and doses stay in the database.`,
			)
		) {
			return;
		}
		delEp.mutate(episodeId, {
			onSuccess: () => toast(`Episode "${title}" hidden`),
			onError: (e) => toast.error((e as Error).message),
		});
	};

	return (
		<Layout
			breadcrumb={
				<Link to="/" className="hover:underline">
					{pet?.name ?? "pet"}
				</Link>
			}
		>
			<div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
				{isLoading || !pet ? (
					<>
						<Skeleton className="h-44 w-full rounded-2xl" />
						<Skeleton className="h-24 w-full rounded-xl" />
					</>
				) : (
					<>
						<PetHero
							pet={pet}
							onEnrich={() => {
								enrich.mutate(undefined, {
									onSuccess: () => toast.success("AI research updated"),
									onError: (e) => toast.error((e as Error).message),
								});
							}}
							enriching={enrich.isPending}
							enrichError={
								enrich.error ? (enrich.error as Error).message : null
							}
						/>

						{pet.enrichment ? (
							<EnrichmentCard enrichment={pet.enrichment} />
						) : null}

						<ExamsCard
							petId={petId}
							confirmedCount={
								(exams ?? []).filter((e) => e.status === "confirmed").length
							}
							draftCount={
								(exams ?? []).filter((e) => e.status === "draft").length
							}
							latestPerformedAt={
								(exams ?? [])
									.map((e) => e.performedAt ?? e.createdAt)
									.sort()
									.reverse()[0] ?? null
							}
						/>

						<Section
							title="Episodes"
							eyebrow="Care history"
							action={
								<Button size="sm" onClick={() => setShowForm((v) => !v)}>
									<Plus className="w-3.5 h-3.5" /> New episode
								</Button>
							}
						>
							{showForm ? (
								<NewEpisodeForm
									pending={startEp.isPending}
									onCancel={() => setShowForm(false)}
									onSubmit={async (input) => {
										const ep = await startEp.mutateAsync({ petId, ...input });
										setShowForm(false);
										toast.success(`Started "${ep.title}"`);
										navigate({
											to: "/episode/$episodeId",
											params: { episodeId: ep.id },
										});
									}}
								/>
							) : null}

							{episodes ? (
								<EpisodesList
									episodes={episodes}
									onDelete={handleDeleteEpisode}
									deletingId={
										delEp.isPending ? (delEp.variables ?? null) : null
									}
								/>
							) : (
								<Skeleton className="h-16 w-full rounded-xl" />
							)}
						</Section>
					</>
				)}
			</div>
		</Layout>
	);
}

function ExamsCard({
	petId,
	confirmedCount,
	draftCount,
	latestPerformedAt,
}: {
	petId: string;
	confirmedCount: number;
	draftCount: number;
	latestPerformedAt: string | null;
}) {
	const total = confirmedCount + draftCount;
	return (
		<Link
			to="/pet/$petId/exams"
			params={{ petId }}
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
							? "No exams uploaded yet — track blood panels and chart evolution."
							: `${confirmedCount} confirmed${
									draftCount > 0 ? ` · ${draftCount} draft` : ""
								}${
									latestPerformedAt
										? ` · latest ${formatDateTime(latestPerformedAt)}`
										: ""
								}`}
					</div>
				</div>
				<ChevronRight className="w-4 h-4 text-muted-foreground" />
			</div>
		</Link>
	);
}

function EnrichmentCard({ enrichment }: { enrichment: Enrichment }) {
	return (
		<div className="rounded-2xl bg-card surface overflow-hidden">
			<div className="flex items-center gap-2 px-5 py-3 border-b border-border/60">
				<div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center">
					<Sparkles className="w-3.5 h-3.5" />
				</div>
				<div>
					<div className="font-display text-base font-semibold leading-tight">
						AI research
					</div>
					<div className="text-[10px] text-muted-foreground">
						Generated {formatDateTime(enrichment.generatedAt)}
					</div>
				</div>
			</div>
			<div className="p-5 space-y-4 text-sm">
				<EnrichmentSection title="Breed">
					{enrichment.breedNotes}
				</EnrichmentSection>
				<EnrichmentSection title="Age">{enrichment.ageNotes}</EnrichmentSection>
				<EnrichmentSection title="Current conditions">
					{enrichment.conditionNotes}
				</EnrichmentSection>
				{enrichment.citations.length > 0 ? (
					<div className="pt-1">
						<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1.5">
							Sources
						</div>
						<ul className="space-y-1 text-xs">
							{enrichment.citations.map((c) => (
								<li key={c.url}>
									<a
										href={c.url}
										target="_blank"
										rel="noreferrer"
										className="text-primary hover:underline"
									>
										{c.title}
									</a>
								</li>
							))}
						</ul>
					</div>
				) : null}
			</div>
		</div>
	);
}

function EnrichmentSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	if (!children) return null;
	return (
		<div>
			<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1">
				{title}
			</div>
			<p className="whitespace-pre-wrap text-foreground/85">{children}</p>
		</div>
	);
}

function NewEpisodeForm({
	onSubmit,
	onCancel,
	pending,
}: {
	onSubmit: (input: { title: string; summary?: string }) => Promise<unknown>;
	onCancel: () => void;
	pending: boolean;
}) {
	const [title, setTitle] = useState("");
	const [summary, setSummary] = useState("");
	return (
		<div className="rounded-2xl bg-card surface p-4 space-y-2">
			<Input
				placeholder="Title (e.g. 'GI episode May 2026')"
				value={title}
				onChange={(e) => setTitle(e.target.value)}
			/>
			<Input
				placeholder="Summary (optional)"
				value={summary}
				onChange={(e) => setSummary(e.target.value)}
			/>
			<div className="flex gap-2 pt-1">
				<Button
					size="sm"
					disabled={!title || pending}
					onClick={() => onSubmit({ title, summary: summary || undefined })}
				>
					{pending ? "Saving…" : "Start"}
				</Button>
				<Button size="sm" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</div>
	);
}
