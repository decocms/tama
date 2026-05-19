#!/usr/bin/env bun

// scripts/sync-from-prod.ts
//
// Idempotent remote → local sync for D1 + R2 (mirror of sync-to-prod).
//
// - D1: exports remote rows, rewrites INSERTs as INSERT OR REPLACE so the
//   local mirror gains/refreshes whatever prod has. Local-only rows are kept.
// - R2: walks every key recorded in the REMOTE `files` table and copies each
//   blob into local R2 (miniflare-emulated).
//
// Re-runs are safe. Useful at the start of a dev session to pick up writes
// the agent (or you, from another machine) made against prod.
//
// Run with: bun run sync:from-prod   (or bun scripts/sync-from-prod.ts)

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { clearSyncCache, loadSyncedSet, recordSynced } from "./sync-cache.ts";

const DB_NAME = "myvet";
const BUCKET = "myvet-files";

const FORCE = process.argv.includes("--force");

async function main() {
	const tmp = await mkdtempPrefix();
	try {
		await syncD1(tmp);
		await syncR2(tmp);
		console.log("\n✓ sync complete");
	} finally {
		await rm(tmp, { recursive: true, force: true });
	}
}

// ---------------------------------------------------------------------------
// D1: remote → local
// ---------------------------------------------------------------------------

async function syncD1(tmp: string) {
	console.log("→ D1: exporting remote…");
	const rawDump = join(tmp, "remote.sql");
	await $`bunx wrangler d1 export ${DB_NAME} --remote --no-schema --output ${rawDump}`.quiet();

	const sql = await readFile(rawDump, "utf8");
	const transformed = transformDump(sql);
	const ready = join(tmp, "remote.upsert.sql");
	await writeFile(ready, transformed, "utf8");

	const inserts = (transformed.match(/INSERT OR REPLACE INTO/g) ?? []).length;
	console.log(`  ${inserts} row(s) to upsert`);

	if (inserts === 0) {
		console.log("  nothing to pull");
		return;
	}

	console.log("→ D1: applying to local…");
	await $`bunx wrangler d1 execute ${DB_NAME} --local --file ${ready}`.quiet();
	console.log("  ✓ D1 in sync");
}

function transformDump(sql: string): string {
	const out: string[] = [];
	for (const line of sql.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (trimmed.startsWith("--")) continue;
		if (/^(BEGIN|COMMIT|ROLLBACK|PRAGMA|CREATE|DROP|ALTER)\b/i.test(trimmed)) {
			continue;
		}
		if (/^INSERT\s+INTO\b/i.test(trimmed)) {
			// Skip SQLite internal bookkeeping tables — d1 manages these on
			// each side, and `sqlite_sequence` in particular gets bloated by
			// wrangler's migration runner (one row per migration apply).
			if (/INSERT\s+INTO\s+"?(sqlite_sequence|_cf_METADATA)"?/i.test(trimmed)) {
				continue;
			}
			out.push(
				line.replace(/^(\s*)INSERT\s+INTO/i, "$1INSERT OR REPLACE INTO"),
			);
			continue;
		}
		out.push(line);
	}
	return out.join("\n");
}

// ---------------------------------------------------------------------------
// R2: remote → local. Keys come from the (now-synced) local files table.
// ---------------------------------------------------------------------------

interface FileRow {
	id: string;
	r2_key: string;
	mime_type: string;
}

async function syncR2(tmp: string) {
	// Enumerate from REMOTE D1 — local may have file rows the dev uploaded
	// only locally (audio chunks during dev) whose keys don't exist in remote
	// R2. Iterating remote ensures every key we try to GET actually exists.
	console.log("→ R2: enumerating keys from remote files table…");
	const rows = await queryFiles("remote");

	if (FORCE) {
		await clearSyncCache("fromProd");
		console.log("  (--force) cleared sync cache");
	}
	const alreadySynced = await loadSyncedSet("fromProd");
	const toSync = rows.filter((r) => !alreadySynced.has(r.r2_key));
	const skipped = rows.length - toSync.length;
	console.log(
		`  ${rows.length} key(s) on remote; ${skipped} already mirrored, ${toSync.length} to copy`,
	);

	if (toSync.length === 0) {
		console.log("  ✓ R2 in sync (nothing new)");
		return;
	}

	let done = 0;
	let failed = 0;
	let missing = 0;
	for (const row of toSync) {
		done++;
		const key = row.r2_key;
		const localPath = join(tmp, `blob-${done}.bin`);
		try {
			await $`bunx wrangler r2 object get ${BUCKET}/${key} --remote --file ${localPath}`.quiet();
			await $`bunx wrangler r2 object put ${BUCKET}/${key} --local --file ${localPath} --content-type ${row.mime_type}`.quiet();
			await recordSynced("fromProd", key);
			console.log(`  [${done}/${toSync.length}] ${key}`);
		} catch (err) {
			// biome-ignore lint/suspicious/noExplicitAny: bun shell error has stderr
			const e = err as any;
			const stderr =
				e?.stderr?.toString?.() ??
				e?.stdout?.toString?.() ??
				e?.message ??
				String(err);
			// Orphan: a remote D1 row references a key that doesn't exist in
			// remote R2 (typically a chunk that failed mid-upload). Skip cleanly.
			if (/specified key does not exist/i.test(stderr)) {
				missing++;
				console.log(`  [${done}/${toSync.length}] ${key} — skipped (orphan)`);
				continue;
			}
			failed++;
			const detail = stderr.split("\n")[0].slice(0, 200);
			console.log(`  [${done}/${toSync.length}] ${key} — FAILED: ${detail}`);
		}
	}
	const summary: string[] = [
		`${toSync.length - failed - missing}/${toSync.length} new`,
	];
	if (skipped) summary.push(`${skipped} cached`);
	if (missing) summary.push(`${missing} orphan(s) skipped`);
	if (failed) summary.push(`${failed} failure(s) — re-run to retry`);
	console.log(`  ${failed === 0 ? "✓" : "·"} R2 ${summary.join(", ")}`);
}

async function queryFiles(where: "local" | "remote"): Promise<FileRow[]> {
	const flag = where === "local" ? "--local" : "--remote";
	const out =
		await $`bunx wrangler d1 execute ${DB_NAME} ${flag} --command ${"SELECT id, r2_key, mime_type FROM files;"} --json`.quiet();
	const raw = out.stdout.toString();
	const start = raw.indexOf("[");
	if (start === -1) return [];
	try {
		const parsed = JSON.parse(raw.slice(start)) as Array<{
			results?: FileRow[];
		}>;
		return parsed[0]?.results ?? [];
	} catch {
		return [];
	}
}

// ---------------------------------------------------------------------------

async function mkdtempPrefix(): Promise<string> {
	const dir = join(tmpdir(), `myvet-pull-${Date.now()}`);
	await mkdir(dir, { recursive: true });
	return dir;
}

await main();
