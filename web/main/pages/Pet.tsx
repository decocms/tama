import { useNavigate, useParams } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { EpisodesList } from "../components/EpisodesList.tsx";
import { Layout } from "../components/Layout.tsx";
import { PetCard } from "../components/PetCard.tsx";
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

	const handleDeleteEpisode = (episodeId: string, title: string) => {
		if (
			!window.confirm(
				`Hide episode "${title}"? Notes, prescriptions, and doses stay in the database.`,
			)
		) {
			return;
		}
		delEp.mutate(episodeId);
	};

	return (
		<Layout breadcrumb={<span>{pet?.name ?? "pet"}</span>}>
			<div className="max-w-3xl mx-auto p-4 space-y-4">
				{isLoading || !pet ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : (
					<>
						<PetCard
							pet={pet}
							onEnrich={() => enrich.mutate()}
							enriching={enrich.isPending}
							enrichError={
								enrich.error ? (enrich.error as Error).message : null
							}
						/>

						<div className="flex items-center justify-between pt-2">
							<h2 className="text-base font-semibold">Episodes</h2>
							<Button size="sm" onClick={() => setShowForm((v) => !v)}>
								<Plus className="w-3 h-3" /> New episode
							</Button>
						</div>

						{showForm ? (
							<NewEpisodeForm
								pending={startEp.isPending}
								onCancel={() => setShowForm(false)}
								onSubmit={async (input) => {
									const ep = await startEp.mutateAsync({ petId, ...input });
									setShowForm(false);
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
								deletingId={delEp.isPending ? (delEp.variables ?? null) : null}
							/>
						) : null}
					</>
				)}
			</div>
		</Layout>
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
		<Card>
			<CardContent className="space-y-2 p-4">
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
			</CardContent>
		</Card>
	);
}
