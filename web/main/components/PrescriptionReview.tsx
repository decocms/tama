import { Pill, Plus, Trash2, Utensils } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { Prescription, ScheduleItem } from "@/types/api.ts";
import { useUpdatePrescription } from "../lib/queries.ts";

export function PrescriptionReview({
	prescription,
	onConfirmed,
}: {
	prescription: Prescription;
	onConfirmed?: () => void;
}) {
	const [items, setItems] = useState<ScheduleItem[]>(
		prescription.scheduleItems,
	);
	const update = useUpdatePrescription();

	useEffect(() => {
		setItems(prescription.scheduleItems);
	}, [prescription.id]);

	const confirm = async () => {
		await update.mutateAsync({
			prescriptionId: prescription.id,
			scheduleItems: items,
			status: "confirmed",
		});
		onConfirmed?.();
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center justify-between">
					<span className="flex items-center gap-2">
						Review extraction
						<Badge
							variant={
								prescription.status === "confirmed" ? "default" : "outline"
							}
						>
							{prescription.status}
						</Badge>
					</span>
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() =>
								setItems((prev) => [
									...prev,
									{ name: "", kind: "medication", times: ["09:00"] },
								])
							}
						>
							<Plus className="w-3 h-3" /> Add row
						</Button>
						<Button size="sm" onClick={confirm} disabled={update.isPending}>
							{update.isPending ? "Saving…" : "Confirm"}
						</Button>
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				{items.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No items extracted. Add one manually or re-upload a clearer photo.
					</p>
				) : (
					items.map((it, idx) => (
						<ItemRow
							// biome-ignore lint/suspicious/noArrayIndexKey: list is fully controlled
							key={idx}
							item={it}
							onChange={(patch) =>
								setItems((prev) =>
									prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)),
								)
							}
							onRemove={() =>
								setItems((prev) => prev.filter((_, i) => i !== idx))
							}
						/>
					))
				)}
				{prescription.rawAiText ? (
					<details className="text-xs text-muted-foreground">
						<summary className="cursor-pointer">Raw AI output</summary>
						<pre className="whitespace-pre-wrap mt-2">
							{prescription.rawAiText}
						</pre>
					</details>
				) : null}
			</CardContent>
		</Card>
	);
}

function ItemRow({
	item,
	onChange,
	onRemove,
}: {
	item: ScheduleItem;
	onChange: (patch: Partial<ScheduleItem>) => void;
	onRemove: () => void;
}) {
	const toggleKind = () =>
		onChange({ kind: item.kind === "meal" ? "medication" : "meal" });

	return (
		<div className="rounded-md border p-3 space-y-2">
			<div className="flex items-center gap-2">
				<Button
					size="sm"
					variant={item.kind === "meal" ? "secondary" : "outline"}
					onClick={toggleKind}
				>
					{item.kind === "meal" ? (
						<Utensils className="w-3 h-3" />
					) : (
						<Pill className="w-3 h-3" />
					)}
					{item.kind}
				</Button>
				<Input
					value={item.name}
					placeholder="Name (e.g. PRELONE/B12, PAPA)"
					onChange={(e) => onChange({ name: e.target.value })}
					className="flex-1"
				/>
				<Input
					value={item.dosage ?? ""}
					placeholder="Dosage"
					onChange={(e) => onChange({ dosage: e.target.value || undefined })}
					className="w-32"
				/>
				<Button size="icon" variant="ghost" onClick={onRemove}>
					<Trash2 className="w-3 h-3" />
				</Button>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-xs text-muted-foreground">Times:</span>
				{item.times.map((t, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: list is fully controlled
					<div key={i} className="flex items-center gap-1">
						<Input
							type="time"
							value={t}
							onChange={(e) => {
								const times = [...item.times];
								times[i] = e.target.value;
								onChange({ times });
							}}
							className="w-24 h-8"
						/>
						<button
							type="button"
							onClick={() =>
								onChange({ times: item.times.filter((_, j) => j !== i) })
							}
							className="text-xs text-muted-foreground hover:text-destructive"
						>
							×
						</button>
					</div>
				))}
				<Button
					size="sm"
					variant="outline"
					onClick={() => onChange({ times: [...item.times, "09:00"] })}
				>
					<Plus className="w-3 h-3" />
				</Button>
			</div>
		</div>
	);
}
