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
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { formatDateTime } from "@/lib/format.ts";
import type { TimelineEntry, TimelineType } from "@/types/api.ts";
import { InsightsText } from "../components/ExamInsights.tsx";
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
	const [selected, setSelected] = useState<TimelineEntry | null>(null);

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
											<EntryRow
												key={e.id}
												entry={e}
												onOpen={() => setSelected(e)}
											/>
										))}
									</ul>
								</div>
							))}
						</div>
					))}
				</Section>
			</div>
			{selected ? (
				<EntryReader entry={selected} onClose={() => setSelected(null)} />
			) : null}
		</Layout>
	);
}

function EntryRow({
	entry,
	onOpen,
}: {
	entry: TimelineEntry;
	onOpen: () => void;
}) {
	const m = TYPE_META[entry.type];
	const Icon = m.icon;
	// Long-form entries (notes, recording summaries, visit notes) open a reader.
	const readable = !!entry.detail && entry.detail.length > 0;
	return (
		<li
			className={`flex items-start gap-3 bg-card surface p-3 ${
				readable ? "cursor-pointer surface-hover transition-shadow" : ""
			}`}
			// A colored left bar in the entry's type color — the timeline reads as
			// a color-coded stream at a glance (meds blue, exams green, …).
			style={{ borderLeftWidth: 3, borderLeftColor: m.color }}
			onClick={readable ? onOpen : undefined}
			onKeyDown={
				readable
					? (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onOpen();
							}
						}
					: undefined
			}
			// biome-ignore lint/a11y/useSemanticElements: row is a list item that doubles as a button
			role={readable ? "button" : undefined}
			tabIndex={readable ? 0 : undefined}
		>
			<div
				className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5"
				style={{ backgroundColor: `${m.color}1f`, color: m.color }}
			>
				<Icon className="w-4 h-4" />
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 flex-wrap">
					<span
						className="text-[10px] uppercase tracking-[0.12em] font-bold"
						style={{ color: m.color }}
					>
						{m.label}
					</span>
					{entry.status && entry.type !== "dose" ? (
						<Badge variant="outline" className="text-[10px]">
							{entry.status}
						</Badge>
					) : null}
				</div>
				{entry.title && entry.title !== m.label ? (
					<div className="font-semibold text-sm leading-snug">
						{entry.title}
					</div>
				) : null}
				{entry.detail ? (
					<p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
						{entry.detail}
					</p>
				) : null}
			</div>
			<span className="font-time text-xs text-muted-foreground tabular-nums shrink-0">
				{new Date(entry.at).toLocaleTimeString(undefined, {
					hour: "2-digit",
					minute: "2-digit",
					hour12: false,
				})}
			</span>
		</li>
	);
}

// Full-screen reader for a timeline entry — the whole note/summary, scrollable.
// Esc or backdrop/✕ closes.
function EntryReader({
	entry,
	onClose,
}: {
	entry: TimelineEntry;
	onClose: () => void;
}) {
	const m = TYPE_META[entry.type];
	const Icon = m.icon;
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = prev;
		};
	}, [onClose]);

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: Esc handled above; backdrop click closes
		<div
			className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6 companion-backdrop-in"
			onClick={onClose}
			role="dialog"
			aria-modal="true"
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: inner guard only */}
			<div
				className="bg-background w-full sm:max-w-2xl max-h-[85dvh] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center gap-3 p-4 border-b">
					<div
						className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
						style={{ backgroundColor: `${m.color}1a`, color: m.color }}
					>
						<Icon className="w-4 h-4" />
					</div>
					<div className="flex-1 min-w-0">
						<div className="font-display font-semibold leading-tight truncate">
							{entry.title}
						</div>
						<div className="text-xs text-muted-foreground">
							{m.label} · {formatDateTime(entry.at)}
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
				<div className="p-4 overflow-y-auto">
					{entry.detail ? (
						<InsightsText text={entry.detail} />
					) : (
						<p className="text-sm text-muted-foreground">No details.</p>
					)}
				</div>
			</div>
		</div>
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
