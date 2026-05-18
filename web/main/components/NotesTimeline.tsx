import { MessagesSquare, Mic, Sparkles, StickyNote } from "lucide-react";
import { useMemo } from "react";
import { dayLabel, formatTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import type { Note } from "@/types/api.ts";

const KIND_LABEL: Record<Note["kind"], string> = {
	text: "Text",
	chatlog: "Chat log",
	"ai-summary": "From recording",
};

const KIND_ICON: Record<
	Note["kind"],
	React.ComponentType<{ className?: string }>
> = {
	text: StickyNote,
	chatlog: MessagesSquare,
	"ai-summary": Mic,
};

function dayKey(iso: string): string {
	const d = new Date(iso);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function NotesTimeline({ notes }: { notes: Note[] }) {
	const groups = useMemo(() => {
		const sorted = [...notes].sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		);
		const byDay = new Map<
			string,
			{ label: string; iso: string; notes: Note[] }
		>();
		for (const n of sorted) {
			const key = dayKey(n.createdAt);
			const existing = byDay.get(key);
			if (existing) {
				existing.notes.push(n);
			} else {
				byDay.set(key, {
					label: dayLabel(n.createdAt),
					iso: n.createdAt,
					notes: [n],
				});
			}
		}
		return Array.from(byDay.values());
	}, [notes]);

	if (groups.length === 0) {
		return (
			<p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground bg-secondary/40">
				No notes yet. Add a text note, paste a chat log, or upload a recording
				to start the timeline.
			</p>
		);
	}

	return (
		<div className="space-y-6">
			{groups.map((g) => (
				<div key={g.iso} className="space-y-2">
					<div className="flex items-baseline gap-2">
						<h4 className="font-display text-sm font-semibold">{g.label}</h4>
					</div>
					<ul className="space-y-2">
						{g.notes.map((n) => (
							<NoteItem key={n.id} note={n} />
						))}
					</ul>
				</div>
			))}
		</div>
	);
}

function NoteItem({ note }: { note: Note }) {
	const Icon = KIND_ICON[note.kind];
	const isAi = note.kind === "ai-summary";
	const isChatlog = note.kind === "chatlog";

	return (
		<li
			className={cn(
				"rounded-lg border p-3.5 bg-card",
				isAi ? "bg-[var(--color-tint-med)]/40" : "",
			)}
		>
			<div className="flex items-center gap-2 mb-1.5">
				<div
					className={cn(
						"shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
						isAi
							? "bg-primary/15 text-primary"
							: "bg-secondary text-muted-foreground",
					)}
				>
					<Icon className="w-3 h-3" />
				</div>
				<span className="text-xs font-medium">{KIND_LABEL[note.kind]}</span>
				{isAi ? (
					<span className="text-[10px] uppercase tracking-wider text-primary inline-flex items-center gap-0.5">
						<Sparkles className="w-2.5 h-2.5" />
						AI
					</span>
				) : null}
				<span className="ml-auto text-xs text-muted-foreground font-time">
					{formatTime(note.createdAt)}
				</span>
			</div>
			<p
				className={cn(
					"text-sm whitespace-pre-wrap text-foreground/90",
					isChatlog ? "font-mono text-xs" : "",
				)}
			>
				{note.content}
			</p>
		</li>
	);
}
