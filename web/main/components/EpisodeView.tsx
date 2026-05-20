import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { Prescription } from "@/types/api.ts";
import { useEpisode, usePet } from "../lib/queries.ts";
import { AccordionSection } from "./AccordionSection.tsx";
import { DoseHistoryButton } from "./DoseHistoryButton.tsx";
import { EpisodeHero } from "./EpisodeHero.tsx";
import { InsightsPanel } from "./InsightsPanel.tsx";
import { Medicines } from "./Medicines.tsx";
import { NotesTimeline } from "./NotesTimeline.tsx";
import { NowStrip } from "./NowStrip.tsx";
import { PrescriptionReview } from "./PrescriptionReview.tsx";
import { Prescriptions } from "./Prescriptions.tsx";
import { Recordings } from "./Recordings.tsx";
import { RemindersToggle } from "./RemindersToggle.tsx";
import { Section } from "./Section.tsx";
import { Timetable } from "./Timetable.tsx";

export function EpisodeView({ episodeId }: { episodeId: string }) {
	const { data, isLoading } = useEpisode(episodeId);
	const ep = data?.episode;
	const { data: pet } = usePet(ep?.petId);

	const [draftRx, setDraftRx] = useState<Prescription | null>(null);

	if (isLoading || !ep || !data) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-36 w-full rounded-2xl" />
				<Skeleton className="h-20 w-full rounded-xl" />
				<Skeleton className="h-48 w-full rounded-xl" />
			</div>
		);
	}

	const candidates = data.timetable.map((entry) => ({
		episodeId,
		episodeTitle: ep.title,
		entry,
	}));

	return (
		<div className="space-y-6">
			<EpisodeHero
				episode={ep}
				pet={pet ?? null}
				prescriptions={data.prescriptions}
				doses={data.doses ?? []}
			/>

			{/* NowStrip + Insights share a row at sm+ (1/3 + 2/3); stacks on
			    mobile. NowStrip renders an idle "All caught up" tile when
			    nothing's imminent so the column always has content. */}
			<div className="grid gap-4 sm:grid-cols-3 items-stretch">
				<div className="sm:col-span-1">
					<NowStrip candidates={candidates} renderIdle />
				</div>
				<div className="sm:col-span-2">
					<InsightsPanel episodeId={episodeId} />
				</div>
			</div>

			<Section
				title="Timetable"
				eyebrow="Today"
				action={
					<div className="flex items-center gap-1">
						<RemindersToggle petId={ep.petId} />
						<DoseHistoryButton doses={data.doses ?? []} />
					</div>
				}
			>
				<Timetable
					episodeId={episodeId}
					entries={data.timetable}
					doses={data.doses ?? []}
				/>
			</Section>

			{/* Sections below Timetable collapse by default so the page is
			    scannable. Counts in each header show what's inside without
			    needing to expand. */}
			<AccordionSection
				title="Medicines & meals"
				eyebrow="Prescribed"
				count={data.prescriptions.length}
			>
				<Medicines
					prescriptions={data.prescriptions}
					scheduleStates={data.scheduleStates ?? []}
					episodeId={episodeId}
				/>
			</AccordionSection>

			<AccordionSection
				title="Prescriptions"
				eyebrow="Documents"
				count={data.prescriptions.length}
			>
				<Prescriptions
					episodeId={episodeId}
					prescriptions={data.prescriptions}
					onDraftCreated={setDraftRx}
				/>
			</AccordionSection>

			{draftRx ? (
				<PrescriptionReview
					prescription={draftRx}
					onConfirmed={() => setDraftRx(null)}
				/>
			) : null}

			<AccordionSection title="Recordings" eyebrow="Voice + AI">
				<Recordings episodeId={episodeId} />
			</AccordionSection>

			<AccordionSection
				title="Notes"
				eyebrow="History"
				count={data.notes.length}
			>
				<NotesTimeline notes={data.notes} />
			</AccordionSection>
		</div>
	);
}
