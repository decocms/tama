import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Layout } from "../components/Layout.tsx";
import { PetsList } from "../components/PetsList.tsx";
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
		del.mutate(petId);
	};

	return (
		<Layout>
			<div className="max-w-3xl mx-auto p-4 space-y-4">
				<div className="flex items-center justify-between">
					<h1 className="text-xl font-semibold">Pets</h1>
					<Button size="sm" onClick={() => setShowForm((v) => !v)}>
						<Plus className="w-3 h-3" /> Add pet
					</Button>
				</div>

				{showForm ? (
					<AddPetForm
						onCancel={() => setShowForm(false)}
						pending={create.isPending}
						onSubmit={(input) =>
							create.mutateAsync(input).then(() => setShowForm(false))
						}
					/>
				) : null}

				{error ? (
					<p className="text-sm text-destructive">{(error as Error).message}</p>
				) : null}

				{isLoading ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : pets ? (
					<PetsList
						pets={pets}
						onDelete={handleDelete}
						deletingId={del.isPending ? (del.variables ?? null) : null}
					/>
				) : null}
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
		<Card>
			<CardHeader>
				<CardTitle className="text-base">New pet</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
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
							})
						}
					>
						{pending ? "Saving…" : "Save"}
					</Button>
					<Button size="sm" variant="outline" onClick={onCancel}>
						Cancel
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
