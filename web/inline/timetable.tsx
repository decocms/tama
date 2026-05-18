import { useMcpState } from "@/context.tsx";
import type { TimetableEntry } from "@/types/api.ts";
import { Timetable } from "../main/components/Timetable.tsx";
import { InlineShell } from "./shell.tsx";

interface Input {
	episodeId: string;
}
interface Result {
	entries: TimetableEntry[];
}

export default function TimetableInline() {
	const state = useMcpState<Input, Result>();
	const episodeId = state.toolInput?.episodeId ?? "";
	const entries = state.toolResult?.entries ?? [];

	return (
		<InlineShell label="Loading timetable">
			<h2 className="text-base font-semibold mb-3">Timetable</h2>
			<Timetable episodeId={episodeId} entries={entries} doses={[]} />
		</InlineShell>
	);
}
