// Always render times in 24h, single line. Times in this app are clinical —
// one canonical format reads faster than locale-bouncing between 12h/24h.

export function formatTime(iso: string): string {
	const d = new Date(iso);
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	return `${hh}:${mm}`;
}

export function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatDateTime(iso: string): string {
	return `${formatDate(iso)} ${formatTime(iso)}`;
}

export function isToday(iso: string): boolean {
	const d = new Date(iso);
	const now = new Date();
	return (
		d.getFullYear() === now.getFullYear() &&
		d.getMonth() === now.getMonth() &&
		d.getDate() === now.getDate()
	);
}

export function dayLabel(iso: string): string {
	const d = new Date(iso);
	const now = new Date();
	const sameDay =
		d.getFullYear() === now.getFullYear() &&
		d.getMonth() === now.getMonth() &&
		d.getDate() === now.getDate();
	if (sameDay) return "Today";
	const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
	const isYesterday =
		d.getFullYear() === yesterday.getFullYear() &&
		d.getMonth() === yesterday.getMonth() &&
		d.getDate() === yesterday.getDate();
	if (isYesterday) return "Yesterday";
	const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
	const isTomorrow =
		d.getFullYear() === tomorrow.getFullYear() &&
		d.getMonth() === tomorrow.getMonth() &&
		d.getDate() === tomorrow.getDate();
	if (isTomorrow) return "Tomorrow";
	const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
	if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
	return d.toLocaleDateString([], {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}

// Relative time, signed: positive = future, negative = past.
// Examples: "in 23m", "in 1h 12m", "12m ago", "1h 12m ago", "now".
export function relativeTime(iso: string, now: number = Date.now()): string {
	const target = new Date(iso).getTime();
	const diffMs = target - now;
	const absMin = Math.round(Math.abs(diffMs) / 60_000);
	if (absMin < 1) return "now";
	const h = Math.floor(absMin / 60);
	const m = absMin % 60;
	const phrase = h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
	return diffMs >= 0 ? `in ${phrase}` : `${phrase} ago`;
}

// Days since an ISO date (rounded down). Used for "Day N of episode".
export function daysSince(iso: string, now: Date = new Date()): number {
	const start = new Date(iso);
	const ms = now.getTime() - start.getTime();
	return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}
