// Unified dose-logging dialog. Used for two distinct entry points:
//
//   1. "Given at" — opened from a pending timetable row's clock button. The
//      item is pre-filled and locked; the user just picks a past time.
//   2. "Log dose" — opened from the Timetable section header for ad-hoc
//      doses ("gave Luftal for gas"). The item name is free-text with
//      suggestions from active schedule_state rows.
//
// Either way the submit calls dose_log; the optimistic update in useLogDose
// (in queries.ts) makes the row appear / disappear instantly.

import { Bell, Loader2, Pill, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
	RadioGroup,
	RadioGroupItem,
} from "@/components/ui/radio-group.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import type { ScheduleState } from "@/types/api.ts";
import { useLogDose } from "../lib/queries.ts";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	episodeId: string;
	scheduleStates: ScheduleState[];
	// When provided, the item name is pre-filled and read-only (the "Given
	// at" use case). Omit for the ad-hoc / free-text path.
	defaultItem?: { name: string; kind: "medication" | "meal" } | null;
}

type WhenMode = "now" | "past";

function todayHHmm(): string {
	const d = new Date();
	const h = String(d.getHours()).padStart(2, "0");
	const m = String(d.getMinutes()).padStart(2, "0");
	return `${h}:${m}`;
}

// Build today's date + an HH:mm in the local timezone, return ISO. If the
// resulting time would be in the future, roll back a day — "Given at 23:50"
// at 00:10 means yesterday, not tonight.
function localHHmmToIso(hhmm: string): string {
	const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
	if (!match) return new Date().toISOString();
	const hh = Number(match[1]);
	const mm = Number(match[2]);
	const d = new Date();
	d.setHours(hh, mm, 0, 0);
	if (d.getTime() > Date.now() + 60_000) {
		d.setDate(d.getDate() - 1);
	}
	return d.toISOString();
}

export function LogDoseDialog({
	open,
	onOpenChange,
	episodeId,
	scheduleStates,
	defaultItem,
}: Props) {
	const log = useLogDose(episodeId);
	const isFixedItem = !!defaultItem;

	const [itemName, setItemName] = useState(defaultItem?.name ?? "");
	const [kind, setKind] = useState<"medication" | "meal">(
		defaultItem?.kind ?? "medication",
	);
	const [whenMode, setWhenMode] = useState<WhenMode>(
		// The "Given at" entry point opens with past pre-selected since that's
		// the whole point of the button. Ad-hoc opens with "now" as default.
		isFixedItem ? "past" : "now",
	);
	const [pastTime, setPastTime] = useState(todayHHmm);
	const [status, setStatus] = useState<"given" | "skipped">("given");
	const [note, setNote] = useState("");

	// Reset state whenever the dialog opens — avoids stale values from the
	// previous invocation leaking into a new one.
	useEffect(() => {
		if (!open) return;
		setItemName(defaultItem?.name ?? "");
		setKind(defaultItem?.kind ?? "medication");
		setWhenMode(isFixedItem ? "past" : "now");
		setPastTime(todayHHmm());
		setStatus("given");
		setNote("");
	}, [open, defaultItem, isFixedItem]);

	// Suggest item names from the live schedule. Filtered as the user types.
	const suggestions = useMemo(() => {
		if (isFixedItem) return [];
		const q = itemName.trim().toLowerCase();
		const all = scheduleStates
			.filter((s) => s.active)
			.map((s) => ({ name: s.displayName, kind: s.kind }));
		if (!q) return all.slice(0, 6);
		return all
			.filter((s) => s.name.toLowerCase().includes(q))
			.slice(0, 6);
	}, [itemName, scheduleStates, isFixedItem]);

	const submit = () => {
		const trimmed = itemName.trim();
		if (!trimmed) {
			toast.error("Pick or type an item name");
			return;
		}
		const actualAt =
			whenMode === "now"
				? new Date().toISOString()
				: localHHmmToIso(pastTime);
		log.mutate(
			{ itemName: trimmed, kind, actualAt, status, note: note || undefined },
			{
				onSuccess: () => {
					toast.success(
						status === "given"
							? `${trimmed} logged`
							: `${trimmed} marked skipped`,
					);
					onOpenChange(false);
				},
				onError: (err) => toast.error((err as Error).message),
			},
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="font-display">
						{isFixedItem ? `Log ${defaultItem.name}` : "Log a dose"}
					</DialogTitle>
					<DialogDescription>
						{isFixedItem
							? "Pick the time it was actually given or skipped."
							: "Record a one-off dose, including items that aren't on a prescription yet."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 text-sm">
					{!isFixedItem ? (
						<div className="space-y-1.5">
							<Label htmlFor="item-name">Item</Label>
							<Input
								id="item-name"
								placeholder="e.g. Luftal, Apoquel, Papa"
								value={itemName}
								onChange={(e) => setItemName(e.target.value)}
								autoFocus
							/>
							{suggestions.length > 0 ? (
								<div className="flex flex-wrap gap-1.5 pt-1">
									{suggestions.map((s) => (
										<button
											key={s.name}
											type="button"
											onClick={() => {
												setItemName(s.name);
												setKind(s.kind);
											}}
											className="text-xs px-2 py-0.5 rounded-md border border-border bg-secondary/40 hover:bg-secondary"
										>
											{s.kind === "meal" ? (
												<Utensils className="w-3 h-3 inline mr-1" />
											) : (
												<Pill className="w-3 h-3 inline mr-1" />
											)}
											{s.name}
										</button>
									))}
								</div>
							) : null}
							<div className="flex gap-3 pt-1.5">
								<label className="flex items-center gap-1.5 text-xs text-muted-foreground">
									<input
										type="radio"
										checked={kind === "medication"}
										onChange={() => setKind("medication")}
									/>
									Medication
								</label>
								<label className="flex items-center gap-1.5 text-xs text-muted-foreground">
									<input
										type="radio"
										checked={kind === "meal"}
										onChange={() => setKind("meal")}
									/>
									Meal
								</label>
							</div>
						</div>
					) : null}

					<div className="space-y-1.5">
						<Label>When</Label>
						<RadioGroup
							value={whenMode}
							onValueChange={(v) => setWhenMode(v as WhenMode)}
							className="flex gap-3"
						>
							<label className="flex items-center gap-1.5 text-sm">
								<RadioGroupItem value="now" id="when-now" />
								<span>Right now</span>
							</label>
							<label className="flex items-center gap-1.5 text-sm">
								<RadioGroupItem value="past" id="when-past" />
								<span>Specific time</span>
							</label>
						</RadioGroup>
						{whenMode === "past" ? (
							<div className="pt-1">
								<Input
									type="time"
									value={pastTime}
									onChange={(e) => setPastTime(e.target.value)}
									className="w-32"
								/>
								<p className="text-[11px] text-muted-foreground mt-1">
									Today, in your local time. If the time is later than now,
									it's interpreted as yesterday.
								</p>
							</div>
						) : null}
					</div>

					<div className="space-y-1.5">
						<Label>Outcome</Label>
						<RadioGroup
							value={status}
							onValueChange={(v) => setStatus(v as "given" | "skipped")}
							className="flex gap-3"
						>
							<label className="flex items-center gap-1.5 text-sm">
								<RadioGroupItem value="given" id="st-given" />
								<span>Given</span>
							</label>
							<label className="flex items-center gap-1.5 text-sm">
								<RadioGroupItem value="skipped" id="st-skipped" />
								<span>Skipped</span>
							</label>
						</RadioGroup>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="log-note">Note (optional)</Label>
						<Textarea
							id="log-note"
							placeholder="Any context — vomited it up, given with food, etc."
							value={note}
							onChange={(e) => setNote(e.target.value)}
							rows={2}
						/>
					</div>

					<Button
						onClick={submit}
						disabled={log.isPending}
						className="w-full"
					>
						{log.isPending ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : (
							<Bell className="w-4 h-4" />
						)}
						{log.isPending ? "Logging…" : "Log"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
