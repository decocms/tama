import {
	Activity,
	FileText,
	FlaskConical,
	Mic,
	Pill,
	Plus,
	Stethoscope,
	Syringe,
	Thermometer,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { formatDateTime } from "@/lib/format.ts";
import type { TimelineEntry, TimelineType } from "@/types/api.ts";
import { Layout } from "../components/Layout.tsx";
import { Section } from "../components/Section.tsx";
import {
	useAddNote,
	useAddSymptom,
	useAddVaccine,
	useAddVetVisit,
	useTimeline,
} from "../lib/queries.ts";

const TYPE_META: Record<
	TimelineType,
	{ label: string; icon: typeof Pill; color: string }
> = {
	note: { label: "Note", icon: FileText, color: "#8a8a8a" },
	dose: { label: "Meds", icon: Pill, color: "#2563eb" },
	exam: { label: "Exams", icon: FlaskConical, color: "#16a34a" },
	recording: { label: "Recordings", icon: Mic, color: "#7c3aed" },
	"vet-visit": { label: "Visits", icon: Stethoscope, color: "#ea580c" },
	vaccine: { label: "Vaccines", icon: Syringe, color: "#0891b2" },
	symptom: { label: "Symptoms", icon: Thermometer, color: "#dc2626" },
	prescription: { label: "Rx", icon: Activity, color: "#9333ea" },
};

const FILTERS: TimelineType[] = [
	"dose",
	"exam",
	"vet-visit",
	"vaccine",
	"symptom",
	"note",
];

export function TimelinePage() {
	const [active, setActive] = useState<Set<TimelineType>>(new Set());
	const kinds = active.size > 0 ? Array.from(active) : undefined;
	const { data: entries, isLoading } = useTimeline(kinds);
	const [adding, setAdding] = useState<null | "note" | "visit" | "vaccine" | "symptom">(
		null,
	);

	const grouped = useMemo(() => groupByDay(entries ?? []), [entries]);

	const toggle = (t: TimelineType) => {
		setActive((prev) => {
			const next = new Set(prev);
			if (next.has(t)) next.delete(t);
			else next.add(t);
			return next;
		});
	};

	return (
		<Layout breadcrumb={<span>timeline</span>}>
			<div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
				<Section
					title="Timeline"
					eyebrow="Everything, in order"
					action={
						<div className="flex gap-1.5">
							<AddMenuButton onPick={setAdding} />
						</div>
					}
				>
					<div className="flex flex-wrap gap-1.5 mb-4">
						{FILTERS.map((t) => {
							const m = TYPE_META[t];
							const on = active.has(t);
							return (
								<button
									type="button"
									key={t}
									onClick={() => toggle(t)}
									className={`text-xs px-2.5 py-1 rounded-full border-2 font-medium transition-colors ${
										on
											? "text-white border-transparent"
											: "border-border text-muted-foreground hover:border-primary/40"
									}`}
									style={on ? { backgroundColor: m.color } : undefined}
								>
									{m.label}
								</button>
							);
						})}
					</div>

					{adding ? (
						<AddForm kind={adding} onClose={() => setAdding(null)} />
					) : null}

					{isLoading ? (
						<Skeleton className="h-40 w-full rounded-xl" />
					) : (grouped.length === 0 ? (
						<p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground bg-secondary/40">
							Nothing logged yet. Add a visit, vaccine, symptom, or note — or
							upload something in Assets.
						</p>
					) : (
						<div className="space-y-6">
							{grouped.map((g) => (
								<div key={g.day}>
									<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-2 sticky top-16 bg-background/80 backdrop-blur py-1">
										{g.label}
									</div>
									<ul className="space-y-2">
										{g.entries.map((e) => (
											<EntryRow key={e.id} entry={e} />
										))}
									</ul>
								</div>
							))}
						</div>
					))}
				</Section>
			</div>
		</Layout>
	);
}

function EntryRow({ entry }: { entry: TimelineEntry }) {
	const m = TYPE_META[entry.type];
	const Icon = m.icon;
	return (
		<li className="flex items-start gap-3 rounded-xl bg-card surface p-3">
			<div
				className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
				style={{ backgroundColor: `${m.color}1a`, color: m.color }}
			>
				<Icon className="w-3.5 h-3.5" />
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 flex-wrap">
					<span className="font-medium text-sm">{entry.title}</span>
					{entry.status && entry.type !== "dose" ? (
						<Badge variant="outline" className="text-[10px]">
							{entry.status}
						</Badge>
					) : null}
				</div>
				{entry.detail ? (
					<p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
						{entry.detail}
					</p>
				) : null}
			</div>
			<span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
				{new Date(entry.at).toLocaleTimeString(undefined, {
					hour: "2-digit",
					minute: "2-digit",
				})}
			</span>
		</li>
	);
}

function AddMenuButton({
	onPick,
}: {
	onPick: (k: "note" | "visit" | "vaccine" | "symptom") => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className="relative">
			<Button size="sm" onClick={() => setOpen((v) => !v)}>
				<Plus className="w-3.5 h-3.5" /> Log
			</Button>
			{open ? (
				<div className="absolute right-0 mt-1 z-10 rounded-xl border bg-card shadow-lg p-1 w-40">
					{(
						[
							["visit", "Vet visit"],
							["vaccine", "Vaccine"],
							["symptom", "Symptom"],
							["note", "Note"],
						] as const
					).map(([k, label]) => (
						<button
							type="button"
							key={k}
							className="block w-full text-left px-3 py-1.5 text-sm rounded-lg hover:bg-primary/10"
							onClick={() => {
								onPick(k);
								setOpen(false);
							}}
						>
							{label}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

function AddForm({
	kind,
	onClose,
}: {
	kind: "note" | "visit" | "vaccine" | "symptom";
	onClose: () => void;
}) {
	const addNote = useAddNote();
	const addVisit = useAddVetVisit();
	const addVaccine = useAddVaccine();
	const addSymptom = useAddSymptom();
	const [a, setA] = useState("");
	const [b, setB] = useState("");

	const pending =
		addNote.isPending ||
		addVisit.isPending ||
		addVaccine.isPending ||
		addSymptom.isPending;

	const submit = async () => {
		try {
			if (kind === "note") {
				if (!a.trim()) return;
				await addNote.mutateAsync({ content: a, kind: "general" });
			} else if (kind === "visit") {
				await addVisit.mutateAsync({ clinic: a || undefined, reason: b || undefined });
			} else if (kind === "vaccine") {
				if (!a.trim()) return;
				await addVaccine.mutateAsync({ name: a });
			} else if (kind === "symptom") {
				if (!a.trim()) return;
				await addSymptom.mutateAsync({ description: a });
			}
			toast.success("Logged");
			onClose();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	return (
		<div className="rounded-2xl bg-card surface p-4 space-y-2 mb-4">
			{kind === "note" ? (
				<Textarea
					placeholder="What happened?"
					rows={3}
					value={a}
					onChange={(e) => setA(e.target.value)}
				/>
			) : kind === "visit" ? (
				<>
					<Input
						placeholder="Clinic / vet"
						value={a}
						onChange={(e) => setA(e.target.value)}
					/>
					<Input
						placeholder="Reason"
						value={b}
						onChange={(e) => setB(e.target.value)}
					/>
				</>
			) : kind === "vaccine" ? (
				<Input
					placeholder="Vaccine name (e.g. Rabies)"
					value={a}
					onChange={(e) => setA(e.target.value)}
				/>
			) : (
				<Input
					placeholder="Describe the symptom"
					value={a}
					onChange={(e) => setA(e.target.value)}
				/>
			)}
			<div className="flex gap-2">
				<Button size="sm" onClick={submit} disabled={pending}>
					{pending ? "Saving…" : "Add to timeline"}
				</Button>
				<Button size="sm" variant="outline" onClick={onClose}>
					Cancel
				</Button>
			</div>
		</div>
	);
}

function groupByDay(
	entries: TimelineEntry[],
): { day: string; label: string; entries: TimelineEntry[] }[] {
	const byDay = new Map<string, TimelineEntry[]>();
	for (const e of entries) {
		const day = e.at.slice(0, 10);
		(byDay.get(day) ?? byDay.set(day, []).get(day) ?? []).push(e);
	}
	return Array.from(byDay.entries())
		.sort((a, b) => (a[0] < b[0] ? 1 : -1))
		.map(([day, es]) => ({
			day,
			label: formatDateTime(`${day}T12:00:00Z`).replace(/,.*$/, ""),
			entries: es,
		}));
}
