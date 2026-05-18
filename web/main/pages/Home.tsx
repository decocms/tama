import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Layout } from "../components/Layout.tsx";
import { OpenEpisodes } from "../components/OpenEpisodes.tsx";
import { PetsList } from "../components/PetsList.tsx";
import { Section } from "../components/Section.tsx";
import { useCreatePet, useDeletePet, usePets } from "../lib/queries.ts";

export function HomePage() {
	const { data: pets, isLoading, error } = usePets();
	const create = useCreatePet();
	const del = useDeletePet();
	const [showForm, setShowForm] = useState(false);

	const handleDelete = (petId: string, name: string) => {
		if (
			!window.confirm(
				`Hide ${name} from the dashboard? Its episodes will be hidden too; data stays in the database.`,
			)
		) {
			return;
		}
		del.mutate(petId, {
			onSuccess: () => toast(`${name} hidden`),
			onError: (e) => toast.error((e as Error).message),
		});
	};

	return (
		<Layout>
			<div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-8">
				<OpenEpisodes />

				<Section
					title="Pets"
					eyebrow="Roster"
					action={
						<Button size="sm" onClick={() => setShowForm((v) => !v)}>
							<Plus className="w-3.5 h-3.5" /> Add pet
						</Button>
					}
				>
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
					) : null}

					{error ? (
						<p className="text-sm text-destructive">
							{(error as Error).message}
						</p>
					) : null}

					{isLoading ? (
						<div className="grid gap-2.5 sm:grid-cols-2">
							<Skeleton className="h-16 rounded-xl" />
							<Skeleton className="h-16 rounded-xl" />
						</div>
					) : pets ? (
						<PetsList
							pets={pets}
							onDelete={handleDelete}
							deletingId={del.isPending ? (del.variables ?? null) : null}
						/>
					) : null}
				</Section>
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
		<div className="rounded-xl border bg-card p-4 space-y-2">
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
