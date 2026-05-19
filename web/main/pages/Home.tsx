import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { Episode } from "@/types/api.ts";
import { Layout } from "../components/Layout.tsx";
import { PetSummaryCard } from "../components/PetSummaryCard.tsx";
import { useCreatePet, useEpisodes, usePets } from "../lib/queries.ts";

export function HomePage() {
	const { data: pets, isLoading: petsLoading, error } = usePets();
	const { data: episodes, isLoading: episodesLoading } = useEpisodes();
	const create = useCreatePet();
	const [showForm, setShowForm] = useState(false);

	const activeByPet = useMemo(() => {
		const m = new Map<string, Episode>();
		for (const e of episodes ?? []) {
			if (e.status !== "open") continue;
			const existing = m.get(e.petId);
			if (
				!existing ||
				new Date(e.startedAt).getTime() > new Date(existing.startedAt).getTime()
			) {
				m.set(e.petId, e);
			}
		}
		return m;
	}, [episodes]);

	const isLoading = petsLoading || episodesLoading;

	return (
		<Layout>
			<div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
				{error ? (
					<p className="text-sm text-destructive">{(error as Error).message}</p>
				) : null}

				{isLoading ? (
					<div className="space-y-4">
						<Skeleton className="h-44 rounded-2xl" />
						<Skeleton className="h-44 rounded-2xl" />
					</div>
				) : pets && pets.length > 0 ? (
					<div className="space-y-4">
						{pets.map((pet) => (
							<PetSummaryCard
								key={pet.id}
								pet={pet}
								activeEpisode={activeByPet.get(pet.id) ?? null}
							/>
						))}
					</div>
				) : (
					<div className="rounded-2xl bg-card surface p-8 text-sm text-muted-foreground text-center">
						No pets yet. Add your first one below.
					</div>
				)}

				{showForm ? (
					<AddPetForm
						onCancel={() => setShowForm(false)}
						pending={create.isPending}
						onSubmit={(input) =>
							create
								.mutateAsync(input)
								.then(() => {
									setShowForm(false);
									toast.success(`${input.name} added`);
								})
								.catch((e) => toast.error((e as Error).message))
						}
					/>
				) : (
					<div className="flex justify-end">
						<Button
							size="sm"
							variant="outline"
							onClick={() => setShowForm(true)}
						>
							<Plus className="w-3.5 h-3.5" />
							Add pet
						</Button>
					</div>
				)}
			</div>
		</Layout>
	);
}

function AddPetForm({
	onSubmit,
	onCancel,
	pending,
}: {
	onSubmit: (input: {
		name: string;
		species?: string;
		breed?: string;
		dob?: string;
		weightKg?: number;
		ownerNotes?: string;
		timezone?: string;
	}) => Promise<unknown>;
	onCancel: () => void;
	pending: boolean;
}) {
	const [name, setName] = useState("");
	const [breed, setBreed] = useState("");
	const [dob, setDob] = useState("");
	const [weight, setWeight] = useState("");
	const [notes, setNotes] = useState("");

	return (
		<div className="rounded-2xl bg-card surface p-4 space-y-2">
			<h3 className="font-display text-base font-semibold mb-1">New pet</h3>
			<Input
				placeholder="Name (required)"
				value={name}
				onChange={(e) => setName(e.target.value)}
			/>
			<Input
				placeholder="Breed"
				value={breed}
				onChange={(e) => setBreed(e.target.value)}
			/>
			<Input
				placeholder="Age (e.g. '5 years')"
				value={dob}
				onChange={(e) => setDob(e.target.value)}
			/>
			<Input
				placeholder="Weight (kg)"
				type="number"
				value={weight}
				onChange={(e) => setWeight(e.target.value)}
			/>
			<Input
				placeholder="Owner notes / current conditions"
				value={notes}
				onChange={(e) => setNotes(e.target.value)}
			/>
			<div className="flex gap-2 pt-2">
				<Button
					size="sm"
					disabled={!name || pending}
					onClick={() =>
						onSubmit({
							name,
							breed: breed || undefined,
							dob: dob || undefined,
							weightKg: weight ? Number(weight) : undefined,
							ownerNotes: notes || undefined,
							timezone:
								Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
						})
					}
				>
					{pending ? "Saving…" : "Save"}
				</Button>
				<Button size="sm" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</div>
	);
}
