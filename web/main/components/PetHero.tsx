import { ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import type { Pet } from "@/types/api.ts";
import { Avatar } from "./Avatar.tsx";

const NOTES_PREVIEW_CHARS = 220;

export function PetHero({
	pet,
	onEnrich,
	enriching,
	enrichError,
}: {
	pet: Pet;
	onEnrich?: () => void;
	enriching?: boolean;
	enrichError?: string | null;
}) {
	const [notesOpen, setNotesOpen] = useState(false);
	const notes = pet.ownerNotes ?? "";
	const needsTruncate = notes.length > NOTES_PREVIEW_CHARS;
	const preview = needsTruncate
		? `${notes.slice(0, NOTES_PREVIEW_CHARS).trimEnd()}…`
		: notes;

	return (
		<div className="rounded-2xl border bg-card overflow-hidden">
			<div className="p-5 flex flex-col sm:flex-row sm:items-center gap-5">
				<Avatar name={pet.name} size="xl" />
				<div className="flex-1 min-w-0">
					<h1 className="font-display text-3xl sm:text-4xl font-semibold leading-none">
						{pet.name}
					</h1>
					<div className="flex flex-wrap items-center gap-1.5 mt-2">
						<Chip>{pet.species}</Chip>
						{pet.breed ? <Chip>{pet.breed}</Chip> : null}
						{pet.dob ? <Chip muted>{pet.dob}</Chip> : null}
						{pet.weightKg ? <Chip muted>{pet.weightKg} kg</Chip> : null}
						{pet.timezone ? (
							<Chip muted className="font-time text-xs">
								{pet.timezone}
							</Chip>
						) : null}
					</div>
				</div>
				{onEnrich ? (
					<Button
						size="sm"
						variant={pet.enrichment ? "outline" : "default"}
						onClick={onEnrich}
						disabled={enriching}
						className="shrink-0"
					>
						<Sparkles className="w-3.5 h-3.5" />
						{pet.enrichment
							? enriching
								? "Researching…"
								: "Refresh research"
							: enriching
								? "Researching…"
								: "Research with AI"}
					</Button>
				) : null}
			</div>

			{notes ? (
				<div className="px-5 pb-5">
					<div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground mb-1.5">
						Owner notes
					</div>
					<p className="text-sm whitespace-pre-wrap text-foreground/85">
						{notesOpen || !needsTruncate ? notes : preview}
					</p>
					{needsTruncate ? (
						<button
							type="button"
							onClick={() => setNotesOpen((v) => !v)}
							className="mt-1.5 text-xs text-primary hover:underline inline-flex items-center gap-1"
						>
							<ChevronDown
								className={cn(
									"w-3 h-3 transition-transform",
									notesOpen ? "rotate-180" : "",
								)}
							/>
							{notesOpen ? "Show less" : "Read more"}
						</button>
					) : null}
				</div>
			) : null}

			{enrichError ? (
				<div className="px-5 pb-4 text-xs text-destructive">{enrichError}</div>
			) : null}
		</div>
	);
}

function Chip({
	children,
	muted,
	className,
}: {
	children: React.ReactNode;
	muted?: boolean;
	className?: string;
}) {
	return (
		<Badge
			variant="outline"
			className={cn(
				"text-xs font-normal",
				muted ? "text-muted-foreground" : "",
				className,
			)}
		>
			{children}
		</Badge>
	);
}
