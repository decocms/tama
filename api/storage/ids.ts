export function newId(prefix: string): string {
	const random = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
	return `${prefix}_${random}`;
}
