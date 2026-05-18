import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Activity, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatDateTime } from "@/lib/format.ts";
import type { Enrichment } from "@/types/api.ts";
import { BreathingCounter } from "../components/BreathingCounter.tsx";
import { EpisodesList } from "../components/EpisodesList.tsx";
import { Layout } from "../components/Layout.tsx";
import { PetHero } from "../components/PetHero.tsx";
import { Section } from "../components/Section.tsx";
import {
	useDeleteEpisode,
	useEnrichPet,
	useEpisodes,
	usePet,
	useStartEpisode,
} from "../lib/queries.ts";

export function PetPage() {
	const { petId } = useParams({ from: "/pet/$petId" });
	const navigate = useNavigate();
	const { data: pet, isLoading } = usePet(petId);
	const { data: episodes } = useEpisodes(petId);
	const enrich = useEnrichPet(petId);
	const startEp = useStartEpisode();
	const delEp = useDeleteEpisode();
	const [showForm, setShowForm] = useState(false);
	const [breathingOpen, setBreathingOpen] = useState(false);

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

						<Section
							title="Vitals"
							eyebrow="Quick tools"
							action={
								<Button
									size="sm"
									variant="outline"
									onClick={() => setBreathingOpen(true)}
								>
									<Activity className="w-3.5 h-3.5" /> Count breathing rate
								</Button>
							}
						>
							<p className="text-xs text-muted-foreground">
								Use the camera to measure {pet.name}'s respiratory rate in real
								time — point at the chest or flank for ~15 seconds.
							</p>
						</Section>

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
			<BreathingCounter
				open={breathingOpen}
				onClose={() => setBreathingOpen(false)}
			/>
		</Layout>
	);
}

function EnrichmentCard({ enrichment }: { enrichment: Enrichment }) {
	return (
		<div className="rounded-2xl border bg-card overflow-hidden">
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
		<div className="rounded-xl border bg-card p-4 space-y-2">
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
