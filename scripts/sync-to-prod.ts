#!/usr/bin/env bun

// scripts/sync-to-prod.ts
//
// Idempotent local → remote sync for D1 + R2.
//
// - D1: exports local rows, rewrites INSERTs as INSERT OR REPLACE so the
//   remote ends up with at least the local state. Existing remote rows with
//   matching primary keys are overwritten; remote-only rows are left alone.
//   (Re-running the script with no local changes is a no-op.)
// - R2: walks every key recorded in the local `files` table and PUTs each
//   to the remote bucket. R2 PUTs are idempotent (same key replaces same
//   bytes), so re-runs are safe — just bandwidth.
//
// Run with: bun run sync:to-prod   (or bun scripts/sync-to-prod.ts)

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { clearSyncCache, loadSyncedSet, recordSynced } from "./sync-cache.ts";

// Defaults target the legacy `myvet` prod (local `myvet` → remote `myvet`).
// Override via env to push the local DB to a DIFFERENT remote deploy — e.g.
// Beto's own worker, whose remote DB/bucket are named differently from the
// local source:
//   SYNC_DB=beto SYNC_BUCKET=beto-files SYNC_LOCAL_DB=myvet \
//   SYNC_LOCAL_BUCKET=myvet-files SYNC_REMOTE_CONFIG=wrangler.beto.toml \
//   SYNC_CACHE_NS=toBeto bun run scripts/sync-to-prod.ts
const DB_NAME = process.env.SYNC_DB ?? "myvet"; // remote target DB
const BUCKET = process.env.SYNC_BUCKET ?? "myvet-files"; // remote target bucket
const LOCAL_DB = process.env.SYNC_LOCAL_DB ?? DB_NAME; // local source DB
const LOCAL_BUCKET = process.env.SYNC_LOCAL_BUCKET ?? BUCKET; // local source bucket
const CACHE_NS = process.env.SYNC_CACHE_NS ?? "toProd";
// When the remote DB only resolves via a non-default wrangler config.
const REMOTE_CFG = process.env.SYNC_REMOTE_CONFIG
	? ["-c", process.env.SYNC_REMOTE_CONFIG]
	: [];

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
// D1
// ---------------------------------------------------------------------------

async function syncD1(tmp: string) {
	console.log("→ D1: exporting local…");
	const rawDump = join(tmp, "local.sql");
	await $`bunx wrangler d1 export ${LOCAL_DB} --local --no-schema --output ${rawDump}`.quiet();

	const sql = await readFile(rawDump, "utf8");
	const transformed = transformDump(sql);
	const ready = join(tmp, "local.upsert.sql");
	await writeFile(ready, transformed, "utf8");

	const inserts = (transformed.match(/INSERT OR REPLACE INTO/g) ?? []).length;
	console.log(`  ${inserts} row(s) to upsert`);

	if (inserts === 0) {
		console.log("  nothing to push");
		return;
	}

	console.log("→ D1: applying to remote…");
	await $`bunx wrangler d1 execute ${DB_NAME} --remote ${REMOTE_CFG} --file ${ready}`.quiet();
	console.log("  ✓ D1 in sync");
}

// Parent-before-child table order. Wrangler's remote `d1 execute --file` splits
// the file into separate batches/transactions, so `PRAGMA defer_foreign_keys`
// doesn't survive across the whole import — on a FRESH remote a child row can
// land before its parent and trip a FK constraint. Emitting INSERTs in this
// topological order keeps every parent ahead of its children. Tables not listed
// are appended last (after `pets`/`files`, which everything else depends on).
const TABLE_ORDER = [
	"files",
	"pets",
	"notes",
	"exams",
	"exam_metrics",
	"metric_aliases",
	"prescriptions",
	"doses",
	"schedule_state",
	"recordings",
	"recording_chunks",
	"vet_visits",
	"vaccines",
	"symptoms",
	"researches",
	"push_subscriptions",
	"notifications_sent",
];

function transformDump(sql: string): string {
	// `wrangler d1 export --no-schema` still emits some pragmas + transaction
	// wrappers. We strip the schema-affecting statements, rewrite INSERTs to
	// upserts, and bucket them by table so we can emit in dependency order.
	const byTable = new Map<string, string[]>();
	const other: string[] = [];
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
			const table = trimmed
				.replace(/^INSERT\s+INTO\s+/i, "")
				.match(/^"?([A-Za-z0-9_]+)"?/)?.[1];
			const upsert = line.replace(
				/^(\s*)INSERT\s+INTO/i,
				"$1INSERT OR REPLACE INTO",
			);
			const bucket = byTable.get(table ?? "") ?? [];
			bucket.push(upsert);
			byTable.set(table ?? "", bucket);
			continue;
		}
		other.push(line);
	}

	// Defer FK enforcement within each batch too (belt and suspenders alongside
	// the ordering), then emit known tables in dependency order, unknown last.
	const out: string[] = ["PRAGMA defer_foreign_keys=TRUE;", ...other];
	const seen = new Set<string>();
	for (const t of TABLE_ORDER) {
		const rows = byTable.get(t);
		if (rows) {
			out.push(...rows);
			seen.add(t);
		}
	}
	for (const [t, rows] of byTable) {
		if (!seen.has(t)) out.push(...rows);
	}
	return out.join("\n");
}

// ---------------------------------------------------------------------------
// R2 — driven by the local `files` table (every R2 key we ever wrote is
// recorded there, so we don't need bucket listing)
// ---------------------------------------------------------------------------

interface FileRow {
	id: string;
	r2_key: string;
	mime_type: string;
}

async function syncR2(tmp: string) {
	console.log("→ R2: enumerating keys from local files table…");
	const rows = await queryLocalFiles();

	if (FORCE) {
		await clearSyncCache(CACHE_NS);
		console.log("  (--force) cleared sync cache");
	}
	const alreadySynced = await loadSyncedSet(CACHE_NS);
	const toSync = rows.filter((r) => !alreadySynced.has(r.r2_key));
	const skipped = rows.length - toSync.length;
	console.log(
		`  ${rows.length} local key(s); ${skipped} already mirrored, ${toSync.length} to upload`,
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
			await $`bunx wrangler r2 object get ${LOCAL_BUCKET}/${key} --local --file ${localPath}`.quiet();
			await $`bunx wrangler r2 object put ${BUCKET}/${key} --remote --file ${localPath} --content-type ${row.mime_type}`.quiet();
			await recordSynced(CACHE_NS, key);
			console.log(`  [${done}/${toSync.length}] ${key}`);
		} catch (err) {
			// biome-ignore lint/suspicious/noExplicitAny: bun shell error has stderr
			const e = err as any;
			const stderr =
				e?.stderr?.toString?.() ??
				e?.stdout?.toString?.() ??
				e?.message ??
				String(err);
			// Orphan: a local D1 files row whose R2 object isn't actually in
			// local storage (typically inherited from sync-from-prod where the
			// remote R2 blob was missing). Nothing to push — skip cleanly.
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

async function queryLocalFiles(): Promise<FileRow[]> {
	const out =
		await $`bunx wrangler d1 execute ${LOCAL_DB} --local --command ${"SELECT id, r2_key, mime_type FROM files;"} --json`.quiet();
	const raw = out.stdout.toString();
	// `wrangler d1 execute --json` prints a banner before the JSON. Find the
	// first '['.
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
	const dir = join(tmpdir(), `myvet-sync-${Date.now()}`);
	await mkdir(dir, { recursive: true });
	return dir;
}

await main();
