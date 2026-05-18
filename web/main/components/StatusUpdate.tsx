import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { cn } from "@/lib/utils.ts";
import { keys, useAddNote, useRefreshInsights } from "../lib/queries.ts";

/**
 * Compact inline form for keeping an episode's status fresh. Submitting:
 *   1. appends the text as a regular note (preserves history in NotesTimeline),
 *   2. triggers a fresh insights run (which updates episodes.currentStatus),
 *   3. invalidates the episode query so the hero re-renders with the new status.
 */
export function StatusUpdate({ episodeId }: { episodeId: string }) {
	const qc = useQueryClient();
	const addNote = useAddNote(episodeId);
	const refresh = useRefreshInsights(episodeId);
	const [value, setValue] = useState("");

	const busy = addNote.isPending || refresh.isPending;

	const submit = async () => {
		const text = value.trim();
		if (!text) return;
		try {
			await addNote.mutateAsync({ kind: "text", content: text });
			setValue("");
			toast("Update added — re-reading status…");
			await refresh.mutateAsync();
			qc.invalidateQueries({ queryKey: keys.episode(episodeId) });
			toast.success("Status updated");
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	return (
		<div className="rounded-xl border bg-card p-3.5 space-y-2.5">
			<div className="flex items-baseline justify-between gap-2">
				<div>
					<div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
						Add an update
					</div>
					<p className="text-xs text-muted-foreground mt-0.5">
						Anything new: vet visit, symptoms, dose adjustments. AI re-reads the
						status after.
					</p>
				</div>
			</div>
			<Textarea
				placeholder="e.g. Vet check today — vomiting stopped, continue prelone 5 more days"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				rows={2}
				className="resize-none"
				onKeyDown={(e) => {
					if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
						e.preventDefault();
						void submit();
					}
				}}
			/>
			<div className="flex items-center justify-between gap-2">
				<span className="text-[10px] text-muted-foreground">
					⌘/Ctrl + Enter to send
				</span>
				<Button size="sm" onClick={submit} disabled={!value.trim() || busy}>
					{busy ? (
						<RefreshCw className={cn("w-3.5 h-3.5", "animate-spin")} />
					) : (
						<Send className="w-3.5 h-3.5" />
					)}
					{busy ? "Updating…" : "Send update"}
				</Button>
			</div>
		</div>
	);
}
