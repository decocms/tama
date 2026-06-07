import { ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { Research } from "@/types/api.ts";
import { Layout } from "../components/Layout.tsx";
import { Section } from "../components/Section.tsx";
import { usePet, useResearches, useRunResearch } from "../lib/queries.ts";

// Top-level Research app: ask a grounded vet-research question (auto-uses the
// pet sheet + meds as context) and browse the saved history. AI exam
// explanations also land here (saved by exam_explain).
export function ResearchPage() {
	const { data: pet } = usePet();
	const { data: researches } = useResearches();
	const run = useRunResearch();
	const [q, setQ] = useState("");
	const name = pet?.name ?? "your pet";

	const ask = () => {
		const question = q.trim();
		if (question.length < 4) {
			toast.error("Ask a fuller question");
			return;
		}
		run.mutate(question, {
			onSuccess: () => {
				setQ("");
				toast.success("Research saved");
			},
			onError: (e) => toast.error((e as Error).message),
		});
	};

	return (
		<Layout breadcrumb="Research">
			<div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
				<Section title="Research" eyebrow="Ask, grounded in the case">
					<div className="rounded-2xl bg-card surface p-4 space-y-3">
						<p className="text-xs text-muted-foreground">
							Ask anything about {name}'s health — drug interactions, what a
							result means, what to expect. It's searched against the literature
							with {name}'s pet sheet + meds attached, and saved below. Research
							to bring to your vet — not a diagnosis.
						</p>
						<div className="flex gap-2">
							<Input
								placeholder="e.g. Is Prednisolone safe long-term with his stomach issues?"
								value={q}
								onChange={(e) => setQ(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") ask();
								}}
								disabled={run.isPending}
							/>
							<Button onClick={ask} disabled={run.isPending} className="shrink-0">
								<Search className="w-3.5 h-3.5" />
								{run.isPending ? "Researching…" : "Research"}
							</Button>
						</div>
						{run.isPending ? (
							<p className="text-sm text-muted-foreground">
								Searching reputable veterinary sources…
							</p>
						) : null}
					</div>

					{(researches ?? []).length > 0 ? (
						<div className="space-y-2 mt-3">
							{(researches ?? []).map((r) => (
								<ResearchItem key={r.id} research={r} />
							))}
						</div>
					) : (
						<p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground bg-secondary/40 mt-3">
							No researches yet. Ask a question above, or hit "Explain with AI"
							on the Exams page — analyses are saved here too.
						</p>
					)}
				</Section>
			</div>
		</Layout>
	);
}

function ResearchItem({ research }: { research: Research }) {
	const [open, setOpen] = useState(false);
	const date = (() => {
		try {
			return new Date(research.createdAt).toLocaleString(undefined, {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
		} catch {
			return research.createdAt;
		}
	})();
	return (
		<div
			className="bg-card surface surface-hover transition-shadow p-4"
			style={{ borderLeftWidth: 3, borderLeftColor: "#7c5cc4" }}
		>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="w-full flex items-start gap-2 text-left"
			>
				<ChevronDown
					className={`w-4 h-4 mt-0.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
					style={{ color: "#7c5cc4" }}
				/>
				<div className="flex-1 min-w-0">
					<div className="font-semibold text-sm leading-snug">
						{research.question}
					</div>
					<div className="font-time text-[10px] text-muted-foreground mt-0.5">
						{date}
					</div>
				</div>
			</button>
			{open ? (
				<div className="mt-3 pl-6 space-y-3 text-sm">
					<p className="text-foreground/85 leading-relaxed whitespace-pre-wrap">
						{research.answer}
					</p>
					{research.keyPoints.length > 0 ? (
						<ul className="space-y-1">
							{research.keyPoints.map((k) => (
								<li
									key={k}
									className="text-foreground/85 pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-primary"
								>
									{k}
								</li>
							))}
						</ul>
					) : null}
					{research.cautions.length > 0 ? (
						<div
							className="rounded-lg p-3 text-xs"
							style={{ background: "var(--color-tint-overdue)" }}
						>
							<div className="font-semibold uppercase tracking-wider text-[10px] mb-1 text-[color:var(--color-status-overdue)]">
								Cautions
							</div>
							<ul className="space-y-0.5">
								{research.cautions.map((c) => (
									<li key={c}>{c}</li>
								))}
							</ul>
						</div>
					) : null}
					{research.citations.length > 0 ? (
						<div className="text-xs">
							<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1">
								Sources
							</div>
							<ul className="space-y-0.5">
								{research.citations.map((c) => (
									<li key={c.url}>
										<a
											href={c.url}
											target="_blank"
											rel="noreferrer"
											className="text-primary hover:underline"
										>
											{c.title}
										</a>
									</li>
								))}
							</ul>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
