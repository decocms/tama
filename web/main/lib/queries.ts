import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMcpApp } from "@/context.tsx";
import type {
	Episode,
	EpisodeDashboardResult,
	EpisodeInsightsResult,
	Pet,
	Prescription,
	Recording,
	RecordingChunk,
	TimetableEntry,
} from "@/types/api.ts";
import { callTool } from "./mcp.ts";

export const keys = {
	pets: ["pets"] as const,
	pet: (id: string) => ["pet", id] as const,
	episodes: (petId?: string) => ["episodes", petId ?? "all"] as const,
	episode: (id: string) => ["episode", id] as const,
	timetable: (id: string) => ["timetable", id] as const,
	prescriptions: (epId: string) => ["prescriptions", epId] as const,
	insights: (epId: string) => ["episode-insights", epId] as const,
};

export function usePets() {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.pets,
		queryFn: () =>
			callTool<{ pets: Pet[] }>(app, "pet_list").then((r) => r.pets),
		enabled: !!app,
	});
}

export function usePet(petId: string | undefined) {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.pet(petId ?? ""),
		queryFn: () =>
			callTool<{ pet: Pet | null }>(app, "pet_get", { petId }).then(
				(r) => r.pet,
			),
		enabled: !!app && !!petId,
	});
}

export function useEpisodes(petId?: string) {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.episodes(petId),
		queryFn: () =>
			callTool<{ episodes: Episode[] }>(
				app,
				"episode_list",
				petId ? { petId } : {},
			).then((r) => r.episodes),
		enabled: !!app,
	});
}

function browserTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}

export function useEpisode(episodeId: string | undefined) {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.episode(episodeId ?? ""),
		queryFn: () =>
			callTool<EpisodeDashboardResult>(app, "episode_get", {
				episodeId,
				timeZone: browserTimeZone(),
			}),
		enabled: !!app && !!episodeId,
		refetchInterval: 30_000,
	});
}

export function useCreatePet() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			name: string;
			species?: string;
			breed?: string;
			dob?: string;
			weightKg?: number;
			ownerNotes?: string;
			timezone?: string;
		}) => callTool<{ pet: Pet }>(app, "pet_create", input).then((r) => r.pet),
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.pets }),
	});
}

export function useUpdatePet() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			petId: string;
			name?: string;
			breed?: string | null;
			dob?: string | null;
			weightKg?: number | null;
			ownerNotes?: string | null;
			timezone?: string | null;
		}) =>
			callTool<{ pet: Pet | null }>(app, "pet_update", input).then(
				(r) => r.pet,
			),
		onSuccess: (_, vars) => {
			qc.invalidateQueries({ queryKey: keys.pet(vars.petId) });
			qc.invalidateQueries({ queryKey: keys.pets });
		},
	});
}

export function useDeletePet() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (petId: string) =>
			callTool<{ deleted: boolean }>(app, "pet_delete", { petId }),
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.pets }),
	});
}

export function useDeleteEpisode() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (episodeId: string) =>
			callTool<{ deleted: boolean }>(app, "episode_delete", { episodeId }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: keys.episodes() });
		},
	});
}

export function useEnrichPet(petId: string) {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			callTool<{ pet: Pet }>(app, "pet_enrich", { petId }).then((r) => r.pet),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: keys.pet(petId) });
			qc.invalidateQueries({ queryKey: keys.pets });
		},
	});
}

export function useStartEpisode() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { petId: string; title: string; summary?: string }) =>
			callTool<{ episode: Episode }>(app, "episode_start", input).then(
				(r) => r.episode,
			),
		onSuccess: (_, vars) => {
			qc.invalidateQueries({ queryKey: keys.episodes(vars.petId) });
			qc.invalidateQueries({ queryKey: keys.episodes() });
		},
	});
}

export function useAddNote(episodeId: string) {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { kind: "text" | "chatlog"; content: string }) =>
			callTool(app, "episode_add_note", { episodeId, ...input }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: keys.episode(episodeId) }),
	});
}

export function useUploadPrescription() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			episodeId: string;
			imageBase64: string;
			mimeType: string;
			originalName?: string;
			sourceNotes?: string;
		}) =>
			callTool<{ prescription: Prescription }>(
				app,
				"prescription_upload",
				input,
			).then((r) => r.prescription),
		onSuccess: (_, vars) =>
			qc.invalidateQueries({ queryKey: keys.episode(vars.episodeId) }),
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
		onSuccess: (rx) => {
			if (rx) {
				qc.invalidateQueries({ queryKey: keys.episode(rx.episodeId) });
			}
		},
	});
}

export function useLogDose(episodeId: string) {
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
		}) => callTool(app, "dose_log", { episodeId, ...input }),
		// Optimistic update: the Give click should feel instant. We don't wait
		// for the round-trip — locally remove the pending timetable entry and
		// drop in a synthetic dose row, then reconcile when the server reply
		// arrives (via invalidate on settled). If the call fails, we restore
		// the pre-mutation snapshot.
		onMutate: async (input) => {
			await qc.cancelQueries({ queryKey: keys.episode(episodeId) });
			const previous = qc.getQueryData<EpisodeDashboardResult>(
				keys.episode(episodeId),
			);
			if (!previous) return { previous };
			const targetItem = input.itemName.toLowerCase();
			const targetPlanned = input.plannedAt;
			const actualAt = input.actualAt ?? new Date().toISOString();
			const status: "given" | "skipped" | "undone" = input.status ?? "given";
			// Strip the matching pending entry from the timetable. If plannedAt
			// is supplied we match exactly on it; otherwise we drop the soonest
			// pending entry for that item (matches the Give-from-row UX).
			const newTimetable = (() => {
				if (targetPlanned) {
					return previous.timetable.filter(
						(e) =>
							!(
								e.status === "pending" &&
								e.itemName.toLowerCase() === targetItem &&
								e.scheduledAt === targetPlanned
							),
					);
				}
				let dropped = false;
				return previous.timetable.filter((e) => {
					if (
						!dropped &&
						e.status === "pending" &&
						e.itemName.toLowerCase() === targetItem
					) {
						dropped = true;
						return false;
					}
					return true;
				});
			})();
			const optimisticDose = {
				id: `temp-${Date.now()}`,
				episodeId,
				itemName: input.itemName,
				kind: input.kind ?? ("medication" as const),
				plannedAt: input.plannedAt ?? null,
				actualAt,
				status,
				note: input.note ?? null,
				adjustmentJson: null,
				createdAt: new Date().toISOString(),
			};
			qc.setQueryData<EpisodeDashboardResult>(keys.episode(episodeId), {
				...previous,
				timetable: newTimetable,
				doses: [...previous.doses, optimisticDose],
			});
			return { previous };
		},
		onError: (_err, _input, ctx) => {
			if (ctx?.previous) {
				qc.setQueryData(keys.episode(episodeId), ctx.previous);
			}
		},
		onSettled: () => qc.invalidateQueries({ queryKey: keys.episode(episodeId) }),
	});
}

export function useSnoozeItem(episodeId: string) {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { itemName: string; hours: number }) =>
			callTool(app, "timetable_snooze", { episodeId, ...input }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: keys.episode(episodeId) }),
	});
}

export function useStopItem(episodeId: string) {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { itemName: string; endsAt?: string }) =>
			callTool(app, "timetable_stop_item", { episodeId, ...input }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: keys.episode(episodeId) }),
	});
}

export function useSetItemDuration(episodeId: string) {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			itemName: string;
			startsAt?: string | null;
			endsAt?: string | null;
		}) => callTool(app, "timetable_set_duration", { episodeId, ...input }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: keys.episode(episodeId) }),
	});
}

export type TimetableEntryUI = TimetableEntry;

export function useEpisodeInsights(episodeId: string) {
	const app = useMcpApp();
	return useQuery({
		queryKey: keys.insights(episodeId),
		queryFn: () =>
			callTool<EpisodeInsightsResult>(app, "episode_insights", { episodeId }),
		enabled: !!app && !!episodeId,
		staleTime: 60_000,
	});
}

export function useRefreshInsights(episodeId: string) {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			callTool<EpisodeInsightsResult>(app, "episode_insights", {
				episodeId,
				refresh: true,
			}),
		onSuccess: (data) => {
			qc.setQueryData(keys.insights(episodeId), data);
			// The tool also writes episodes.currentStatus, so refetch the
			// episode dashboard to pick up the new status in the hero.
			qc.invalidateQueries({ queryKey: keys.episode(episodeId) });
		},
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
		// Subscription state doesn't change without a user gesture, so we can
		// keep this fresh for a while.
		staleTime: 60_000,
	});
}

export function useSubscribeToPush() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { petId?: string } = {}) =>
			subscribeToPush({ app, petId: input.petId }),
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

// ---------- Recordings ----------

export const recordingKeys = {
	list: (episodeId: string) => ["recordings", episodeId] as const,
	one: (recordingId: string) => ["recording", recordingId] as const,
};

export function useRecordings(episodeId: string) {
	const app = useMcpApp();
	return useQuery({
		queryKey: recordingKeys.list(episodeId),
		queryFn: () =>
			callTool<{ recordings: Recording[] }>(app, "recording_list", {
				episodeId,
			}).then((r) => r.recordings),
		enabled: !!app && !!episodeId,
	});
}

export function useRecording(recordingId: string | undefined) {
	const app = useMcpApp();
	return useQuery({
		queryKey: recordingKeys.one(recordingId ?? ""),
		queryFn: () =>
			callTool<{ recording: Recording | null; chunks: RecordingChunk[] }>(
				app,
				"recording_get",
				{ recordingId },
			),
		enabled: !!app && !!recordingId,
		refetchInterval: 5_000,
	});
}

export function useCreateRecording() {
	const app = useMcpApp();
	return useMutation({
		mutationFn: (input: {
			episodeId: string;
			mimeType: string;
			originalName?: string;
			durationS?: number;
			numChunks: number;
			originalBase64?: string;
		}) =>
			callTool<{ recording: Recording }>(app, "recording_create", input).then(
				(r) => r.recording,
			),
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
			callTool<{ recording: Recording }>(
				app,
				"recording_transcribe",
				input,
			).then((r) => r.recording),
		onSuccess: (rec) => {
			qc.invalidateQueries({ queryKey: recordingKeys.one(rec.id) });
			qc.invalidateQueries({ queryKey: recordingKeys.list(rec.episodeId) });
		},
	});
}

export function useSummarizeRecording() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (recordingId: string) =>
			callTool<{ recording: Recording }>(app, "recording_summarize", {
				recordingId,
			}).then((r) => r.recording),
		onSuccess: (rec) => {
			qc.invalidateQueries({ queryKey: recordingKeys.one(rec.id) });
		},
	});
}

export function useApplyRecordingGroup() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { episodeId: string; recordingIds: string[] }) =>
			callTool<{
				noteId: string | null;
				summary: string;
				historyUpdate: string;
				recordings: Recording[];
			}>(app, "recording_apply_group", input),
		onSuccess: (data, vars) => {
			qc.invalidateQueries({
				queryKey: recordingKeys.list(vars.episodeId),
			});
			qc.invalidateQueries({ queryKey: keys.episode(vars.episodeId) });
			qc.invalidateQueries({ queryKey: keys.pets });
			for (const rec of data.recordings) {
				qc.invalidateQueries({ queryKey: recordingKeys.one(rec.id) });
			}
		},
	});
}

export function useApplyRecording() {
	const app = useMcpApp();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			recordingId: string;
			historyUpdate?: string;
			episodeNote?: string;
		}) =>
			callTool<{ recording: Recording }>(app, "recording_apply", input).then(
				(r) => r.recording,
			),
		onSuccess: (rec) => {
			qc.invalidateQueries({ queryKey: recordingKeys.one(rec.id) });
			qc.invalidateQueries({ queryKey: recordingKeys.list(rec.episodeId) });
			qc.invalidateQueries({ queryKey: keys.episode(rec.episodeId) });
			qc.invalidateQueries({ queryKey: keys.pets });
		},
	});
}
