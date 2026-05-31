// D1's bind-parameter cap per query. SQLite's library limit is much higher
// (32766) but Cloudflare's D1 service rejects statements with more than 100
// bound variables — the failure mode is opaque, surfacing as
//   "D1_ERROR: too many SQL variables at offset N: SQLITE_ERROR"
// Multi-row inserts are the easiest way to trip this: rows × columns_per_row
// bind variables, which a single 30-row insert with a wide table blows past
// trivially. Use chunkForBindVars() to split the row list before inserting.
export const D1_MAX_BIND_VARS = 100;

// Split a list of rows into chunks small enough that each chunk's
// rows × columnsPerRow stays at-or-below maxVars. Empty input yields no
// chunks. If columnsPerRow exceeds maxVars no insert is safe — we still
// yield one row per chunk so the caller hits a clearer per-row error
// rather than a misleading "too many variables" cliff.
export function chunkForBindVars<T>(
	rows: T[],
	columnsPerRow: number,
	maxVars: number = D1_MAX_BIND_VARS,
): T[][] {
	if (rows.length === 0) return [];
	if (columnsPerRow <= 0) return [rows];
	const perChunk = Math.max(1, Math.floor(maxVars / columnsPerRow));
	const out: T[][] = [];
	for (let i = 0; i < rows.length; i += perChunk) {
		out.push(rows.slice(i, i + perChunk));
	}
	return out;
}
