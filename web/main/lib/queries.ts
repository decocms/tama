import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMcpApp } from "@/context.tsx";
import type {
	Asset,
	Exam,
	ExamMetric,
	ExamMetricInput,
	ExamMetricSeriesPoint,
	Pet,
	Prescription,
	Recording,
	ScheduleState,
	Symptom,
	TimelineEntry,
	TimelineType,
	TimetableEntry,
	Vaccine,
	VetVisit,
} from "@/types/api.ts";
import { callTool } from "./mcp.ts";

export const keys = {
	pet: ["pet"] as const,
	timeline: (kindsCsv: string) => ["timeline", kindsCsv] as const,
	timetable: ["timetable"] as const,
	scheduleStates: ["schedule-states"] as const,
	assets: ["assets"] as const,
	recordings: ["recordings"] as const,
	vetVisits: ["vet-visits"] as const,
	vaccines: ["vaccines"] as const,
	symptoms: ["symptoms"] as const,
	exams: ["exams"] as const,
	exam: (examId: string) => ["exam", examId] as const,
	metricSeries: (keysCsv: string) => ["metric-series", keysCsv] as const,
};

// Invalidate everything that a write might have touched. The app is small
// enough that broad invalidation is simpler and plenty fast.
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
	for (const k of [
		"timeline",
		"timetable",
		"schedule-states",
		"assets",
		"recordings",
		"vet-visits",
		"vaccines",
		"symptoms",
		"exams",
		"exam",
		"metric-series",
		"pet",
	]) {
		qc.invalidateQueries({ queryKey: [k] });
	}
}

// ---------- Pet ----------

export function usePet() {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.pet,
		queryFn: () =>
			callTool<{ pet: Pet | null }>(app, "pet_profile", {}).then((r) => r.pet),
		enabled: true,
	});
}

export function useUpdatePet() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			name?: string;
			breed?: string | null;
			dob?: string | null;
			weightKg?: number | null;
			ownerNotes?: string | null;
			timezone?: string | null;
		}) =>
			callTool<{ pet: Pet | null }>(app, "pet_update", input).then((r) => r.pet),
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.pet }),
	});
}

export function useEnrichPet() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			callTool<{ pet: Pet }>(app, "pet_enrich", {}).then((r) => r.pet),
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.pet }),
	});
}

export function useRefreshSummary() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			callTool<{ summary: string }>(app, "pet_summary_refresh", {}).then(
				(r) => r.summary,
			),
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.pet }),
	});
}

// ---------- Timeline ----------

export function useTimeline(kinds?: TimelineType[]) {
	const app = useMcpApp();
	const kindsCsv = kinds ? [...kinds].sort().join(",") : "";
	return useQuery({
		queryKey: keys.timeline(kindsCsv),
		queryFn: () =>
			callTool<{ entries: TimelineEntry[] }>(app, "timeline_get", {
				kinds: kinds && kinds.length > 0 ? kinds : undefined,
			}).then((r) => r.entries),
		enabled: true,
		refetchInterval: 30_000,
	});
}

export function useAddNote() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			content: string;
			kind?: "text" | "chatlog" | "general";
		}) => callTool(app, "timeline_note_add", input),
		onSuccess: () => invalidateAll(qc),
	});
}

// ---------- Typed timeline entries ----------

export function useVetVisits() {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.vetVisits,
		queryFn: () =>
			callTool<{ visits: VetVisit[] }>(app, "vet_visit_list", {}).then(
				(r) => r.visits,
			),
		enabled: true,
	});
}

export function useAddVetVisit() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			visitedAt?: string;
			vetName?: string;
			clinic?: string;
			reason?: string;
			notes?: string;
		}) => callTool(app, "vet_visit_add", input),
		onSuccess: () => invalidateAll(qc),
	});
}

export function useVaccines() {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.vaccines,
		queryFn: () =>
			callTool<{ vaccines: Vaccine[] }>(app, "vaccine_list", {}).then(
				(r) => r.vaccines,
			),
		enabled: true,
	});
}

export function useAddVaccine() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			name: string;
			administeredAt?: string;
			dueAt?: string;
			lot?: string;
			vetName?: string;
		}) => callTool(app, "vaccine_add", input),
		onSuccess: () => invalidateAll(qc),
	});
}

export function useSymptoms() {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.symptoms,
		queryFn: () =>
			callTool<{ symptoms: Symptom[] }>(app, "symptom_list", {}).then(
				(r) => r.symptoms,
			),
		enabled: true,
	});
}

export function useAddSymptom() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			description: string;
			observedAt?: string;
			severity?: "mild" | "moderate" | "severe";
		}) => callTool(app, "symptom_add", input),
		onSuccess: () => invalidateAll(qc),
	});
}

// ---------- Timetable ----------

function browserTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}

export function useTimetable() {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.timetable,
		queryFn: () =>
			callTool<{ entries: TimetableEntry[] }>(app, "timetable_get", {
				timeZone: browserTimeZone(),
			}).then((r) => r.entries),
		enabled: true,
		refetchInterval: 30_000,
	});
}

export function useScheduleStates() {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.scheduleStates,
		queryFn: () =>
			callTool<{ scheduleStates: ScheduleState[] }>(
				app,
				"schedule_state_list",
				{},
			).then((r) => r.scheduleStates),
		enabled: true,
	});
}

export function useLogDose() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			itemName: string;
			kind?: "medication" | "meal";
			plannedAt?: string;
			actualAt?: string;
			status?: "given" | "skipped" | "undone";
			note?: string;
		}) => callTool(app, "dose_log", input),
		onSuccess: () => invalidateAll(qc),
	});
}

export function useSnoozeItem() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { itemName: string; hours: number }) =>
			callTool(app, "timetable_snooze", input),
		onSuccess: () => invalidateAll(qc),
	});
}

export function useStopItem() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { itemName: string; endsAt?: string }) =>
			callTool(app, "timetable_stop_item", input),
		onSuccess: () => invalidateAll(qc),
	});
}

// ---------- Prescriptions ----------

export function usePrescriptions() {
	const app = useMcpApp();
	return useQuery({
		queryKey: ["prescriptions"],
		queryFn: () =>
			callTool<{ prescriptions: Prescription[] }>(
				app,
				"prescription_list",
				{},
			).then((r) => r.prescriptions),
		enabled: true,
	});
}

export function useUpdatePrescription() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			prescriptionId: string;
			scheduleItems?: Prescription["scheduleItems"];
			status?: "draft" | "confirmed";
			sourceNotes?: string;
		}) =>
			callTool<{ prescription: Prescription | null }>(
				app,
				"prescription_update",
				input,
			).then((r) => r.prescription),
		onSuccess: () => invalidateAll(qc),
	});
}

// ---------- Assets ----------

export function useAssets() {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.assets,
		queryFn: () =>
			callTool<{ assets: Asset[] }>(app, "asset_list", {}).then(
				(r) => r.assets,
			),
		enabled: true,
	});
}

export function useUploadAsset() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			imageBase64?: string;
			mimeType?: string;
			text?: string;
			originalName?: string;
		}) =>
			callTool<{
				assetType: string;
				refId: string;
				fileId: string | null;
			}>(app, "asset_upload", input),
		onSuccess: () => invalidateAll(qc),
	});
}

// ---------- Recordings ----------

export function useRecordings() {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.recordings,
		queryFn: () =>
			callTool<{ recordings: Recording[] }>(app, "recording_list", {}).then(
				(r) => r.recordings,
			),
		enabled: true,
		// Poll while anything is mid-flight so the row statuses advance live.
		refetchInterval: (q) => {
			const data = q.state.data as Recording[] | undefined;
			const busy = data?.some(
				(r) => r.status === "uploading" || r.status === "transcribing",
			);
			return busy ? 2500 : false;
		},
	});
}

export function useCreateRecording() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			mimeType: string;
			originalName?: string;
			durationS?: number;
			numChunks: number;
			originalBase64?: string;
		}) =>
			callTool<{ recording: Recording }>(app, "recording_create", input).then(
				(r) => r.recording,
			),
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.recordings }),
	});
}

export function useAddChunk() {
	const app = useMcpApp();
	return useMutation({
		mutationFn: (input: {
			recordingId: string;
			idx: number;
			startS: number;
			endS: number;
			audioBase64: string;
		}) =>
			callTool<{ chunkId: string; fileId: string }>(
				app,
				"recording_add_chunk",
				input,
			),
	});
}

export function useTranscribeRecording() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { recordingId: string; language?: string }) =>
			callTool<{ recording: Recording }>(app, "recording_transcribe", input),
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.recordings }),
	});
}

export function useApplyRecordingGroup() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { recordingIds: string[] }) =>
			callTool<{
				noteId: string | null;
				summary: string;
				historyUpdate: string;
				recordings: Recording[];
			}>(app, "recording_apply_group", input),
		onSuccess: () => invalidateAll(qc),
	});
}

// ---------- Exams ----------

export function useExams() {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.exams,
		queryFn: () =>
			callTool<{ exams: Exam[] }>(app, "exam_list", {}).then((r) => r.exams),
		enabled: true,
	});
}

export function useExam(examId: string | undefined) {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.exam(examId ?? ""),
		queryFn: () =>
			callTool<{ exam: Exam | null; metrics: ExamMetric[] }>(app, "exam_get", {
				examId,
			}),
		enabled: !!examId,
	});
}

export function useMetricSeries(keys_: string[]) {
	const app = useMcpApp();
	const keysCsv = [...keys_].sort().join(",");
	return useQuery({
		queryKey: keys.metricSeries(keysCsv),
		queryFn: () =>
			callTool<{ series: ExamMetricSeriesPoint[] }>(app, "exam_metric_series", {
				canonicalKeys: keys_.length > 0 ? keys_ : undefined,
			}).then((r) => r.series),
		enabled: true,
	});
}

export function useUploadExam() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			imageBase64: string;
			mimeType: string;
			originalName?: string;
			sourceNotes?: string;
		}) =>
			callTool<{
				exam: Exam;
				metrics: ExamMetric[];
				pendingReviewCount: number;
			}>(app, "exam_upload", input),
		onSuccess: () => invalidateAll(qc),
	});
}

export function usePasteExam() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { text: string; sourceNotes?: string }) =>
			callTool<{
				exam: Exam;
				metrics: ExamMetric[];
				pendingReviewCount: number;
			}>(app, "exam_paste", input),
		onSuccess: () => invalidateAll(qc),
	});
}

export function useExplainExams() {
	const app = useMcpApp();
	return useMutation({
		mutationFn: () =>
			callTool<{ insights: string }>(app, "exam_explain", {}).then(
				(r) => r.insights,
			),
	});
}

export function useUpdateExam() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			examId: string;
			performedAt?: string | null;
			labName?: string | null;
			requestId?: string | null;
			sourceNotes?: string | null;
			status?: "draft" | "confirmed";
			metrics?: ExamMetricInput[];
		}) =>
			callTool<{ exam: Exam | null; metrics: ExamMetric[] }>(
				app,
				"exam_update",
				input,
			),
		onSuccess: () => invalidateAll(qc),
	});
}

export function useDeleteExam() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (examId: string) =>
			callTool<{ deleted: boolean }>(app, "exam_delete", { examId }),
		onSuccess: () => invalidateAll(qc),
	});
}

// ---------- Push notifications ----------

export const pushKeys = {
	subscription: ["push", "subscription"] as const,
};

import {
	getExistingSubscription,
	subscribeToPush,
	unsubscribeFromPush,
} from "./push.ts";

export function usePushSubscription() {
	const app = useMcpApp();
	return useQuery({
		queryKey: pushKeys.subscription,
		queryFn: async () => {
			const sub = await getExistingSubscription();
			return sub
				? { endpoint: sub.endpoint, subscribed: true as const }
				: { endpoint: null, subscribed: false as const };
		},
		enabled: !!app,
		staleTime: 60_000,
	});
}

export function useSubscribeToPush() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => subscribeToPush({ app }),
		onSuccess: () => qc.invalidateQueries({ queryKey: pushKeys.subscription }),
	});
}

export function useUnsubscribeFromPush() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => unsubscribeFromPush(app),
		onSuccess: () => qc.invalidateQueries({ queryKey: pushKeys.subscription }),
	});
}

export function useSendTestPush() {
	const app = useMcpApp();
	return useMutation({
		mutationFn: () =>
			callTool<{ attempted: number; sent: number; errors: number }>(
				app,
				"push_test",
				{},
			),
	});
}
