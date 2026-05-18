// Tiny on-disk cache of "this R2 key has already been mirrored in this
// direction" — keyed by the wrangler-local .wrangler dir so it's gitignored
// and survives between runs.
//
// We can't HEAD an R2 object cheaply via wrangler (no `list` / `head`
// subcommand), so the cheapest "is this already there?" check is "did we
// successfully copy it before?". Worst case if you delete the dest object
// manually, clear the cache (--force) and re-run.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const CACHE_PATH = ".wrangler/sync-cache.json";

export type Direction = "toProd" | "fromProd";

interface CacheShape {
	toProd: string[];
	fromProd: string[];
}

async function load(): Promise<CacheShape> {
	try {
		const raw = await readFile(CACHE_PATH, "utf8");
		const parsed = JSON.parse(raw) as Partial<CacheShape>;
		return {
			toProd: parsed.toProd ?? [],
			fromProd: parsed.fromProd ?? [],
		};
	} catch {
		return { toProd: [], fromProd: [] };
	}
}

async function save(c: CacheShape): Promise<void> {
	await mkdir(dirname(CACHE_PATH), { recursive: true });
	await writeFile(CACHE_PATH, JSON.stringify(c, null, 2), "utf8");
}

export async function loadSyncedSet(dir: Direction): Promise<Set<string>> {
	const c = await load();
	return new Set(c[dir]);
}

export async function recordSynced(
	dir: Direction,
	key: string,
): Promise<void> {
	const c = await load();
	if (!c[dir].includes(key)) {
		c[dir].push(key);
		await save(c);
	}
}

export async function clearSyncCache(dir?: Direction): Promise<void> {
	const c = await load();
	if (dir) {
		c[dir] = [];
	} else {
		c.toProd = [];
		c.fromProd = [];
	}
	await save(c);
}
