import { Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { useExplainExams } from "../lib/queries.ts";

// Shared "Explain with AI" state + UI, used by both the Exams panel overview
// (all metrics) and the detail view (selected subset). Holds the result in
// local state set on success — so the card renders reliably regardless of
// react-query mutation-data timing.
export function useExplainState() {
	const explain = useExplainExams();
	const [text, setText] = useState<string | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const run = (keys?: string[]) => {
		setText(null);
		setErr(null);
		explain.mutate(keys, {
			onSuccess: (t) => setText(t),
			onError: (e) => setErr((e as Error).message),
		});
	};
	return { run, text, error: err, pending: explain.isPending };
}

export function ExplainButton({
	onClick,
	pending,
	disabled,
}: {
	onClick: () => void;
	pending: boolean;
	disabled?: boolean;
}) {
	return (
		<Button size="sm" onClick={onClick} disabled={disabled || pending}>
			<Sparkles className="w-3.5 h-3.5" />
			{pending ? "Reading…" : "Explain with AI"}
		</Button>
	);
}

export function InsightsCard({
	pending,
	error,
	text,
	petName,
}: {
	pending: boolean;
	error: string | null;
	text: string | null;
	petName?: string;
}) {
	if (pending) {
		return (
			<div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
				Reading {petName ?? "your pet"}'s lab trends…
			</div>
		);
	}
	if (error) {
		return (
			<div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
				Couldn't generate insights: {error}
			</div>
		);
	}
	if (!text) return null;
	return (
		<div className="mb-4 rounded-2xl border-2 border-[color:var(--color-border-strong,#2a1f17)]/15 bg-primary/5 p-4">
			<div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] font-semibold text-primary mb-2">
				<Sparkles className="w-3 h-3" /> AI insights
			</div>
			<InsightsText text={text} />
			<p className="mt-3 text-[11px] text-muted-foreground">
				AI explanation of the trends — not a diagnosis. Confirm anything
				important with your vet.
			</p>
		</div>
	);
}

// Minimal renderer for the markdown subset the prompt emits: `## headings`,
// `- bullets`, `**bold**`, paragraphs. Avoids pulling in a markdown dep.
function renderInline(text: string): ReactNode[] {
	return text.split(/\*\*/).map((seg, i) =>
		i % 2 === 1 ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: stable split order
			<strong key={i}>{seg}</strong>
		) : (
			// biome-ignore lint/suspicious/noArrayIndexKey: stable split order
			<span key={i}>{seg}</span>
		),
	);
}

export function InsightsText({ text }: { text: string }) {
	return (
		<div className="space-y-1">
			{text.split("\n").map((raw, i) => {
				const line = raw.trim();
				if (!line) return null;
				if (line.startsWith("#")) {
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: stable line order
						<h4 key={i} className="font-display font-semibold text-sm mt-3 first:mt-0">
							{renderInline(line.replace(/^#+\s*/, ""))}
						</h4>
					);
				}
				if (/^[-*]\s/.test(line)) {
					return (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: stable line order
							key={i}
							className="text-sm text-foreground/85 leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-primary"
						>
							{renderInline(line.replace(/^[-*]\s/, ""))}
						</div>
					);
				}
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: stable line order
					<p key={i} className="text-sm text-foreground/85 leading-relaxed">
						{renderInline(line)}
					</p>
				);
			})}
		</div>
	);
}
