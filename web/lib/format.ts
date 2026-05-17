export function formatTime(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
	const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
	const isTomorrow =
		d.getFullYear() === tomorrow.getFullYear() &&
		d.getMonth() === tomorrow.getMonth() &&
		d.getDate() === tomorrow.getDate();
	if (isTomorrow) return "Tomorrow";
	return d.toLocaleDateString([], {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}
