#!/usr/bin/env bun

// scripts/migrate-beto.ts
//
// ⚠ OUTDATED: this script was written for the episode-era schema (it filters
// episodes and rewrites episode subtrees). The schema is now episode-free
// (see migration 0014 — everything keys to `pet_self`, no episodes). Before
// running Beto's real migration, rework this to map his legacy episode-shaped
// prod data into the timeline shape: drop the episode filtering, re-key every
// child table's pet_id to 'pet_self', and ignore episodes/episode_insights.
// Kept as a reference for the data-mirroring + R2 + verification scaffolding.
//
// One-off migration: take Beto's data from the legacy myvet prod deploy and
// reshape it for a fresh tama-shaped target deploy. Used exactly once during
// the rebrand cutover — Beto's medical history is the only valuable data on
// the source side.
//
// Shape:
//   1. Snapshot source D1 (myvet) via wrangler d1 export --remote.
//   2. Filter the dump to "Beto's subtree" — keep only his pets row and
//      every episode/note/prescription/dose/recording/schedule/exam
//      transitively reachable from him via FKs. Drop other pets' data.
//   3. Rewrite pet_id values from the legacy id to 'pet_self' so the data
//      lands singleton-shaped.
//   4. Apply to the target D1 (tama-beto) via wrangler d1 execute --remote.
//   5. Mirror R2 files: for every files.r2_key, copy the blob from the
//      source bucket (myvet-files) to the target bucket (tama-beto-files).
//   6. Sanity-check row counts: source vs target should match per table.
//
// Inputs are wired via env vars to keep secrets out of the script:
//   SOURCE_DB=myvet
//   TARGET_DB=tama-beto
//   SOURCE_BUCKET=myvet-files
//   TARGET_BUCKET=tama-beto-files
//   BETO_PET_ID=pet_xxxxx              (the legacy id; check with d1 query)
//
// Re-running is NOT safe — the target D1 should be empty (only the seed
// pet_self placeholder from 0011_singleton_pet.sql). The script ABORTS if
// any non-seed data exists on the target. Use --force to override.
//
// Run with: bun scripts/migrate-beto.ts

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const SOURCE_DB = process.env.SOURCE_DB ?? "myvet";
const TARGET_DB = process.env.TARGET_DB ?? "tama-beto";
const SOURCE_BUCKET = process.env.SOURCE_BUCKET ?? "myvet-files";
const TARGET_BUCKET = process.env.TARGET_BUCKET ?? "tama-beto-files";
const BETO_PET_ID = process.env.BETO_PET_ID;
const FORCE = process.argv.includes("--force");
const TARGET_SELF_ID = "pet_self";

if (!BETO_PET_ID) {
	console.error(
		"Set BETO_PET_ID=pet_xxx (the legacy pet id). Find it with:\n  wrangler d1 execute myvet --remote --command \"SELECT id, name FROM pets;\"",
	);
	process.exit(1);
}

async function main() {
	console.log(`Migrating ${BETO_PET_ID} from ${SOURCE_DB} → ${TARGET_DB} (pet_self)`);
	const tmp = await mkdtempPrefix();
	try {
		await preflightTargetEmpty();
		const rewritten = await snapshotAndRewrite(tmp);
		await applyToTarget(rewritten);
		await mirrorR2();
		await verifyCounts();
		console.log("\n✓ Beto migrated. Run a smoke check in the new deploy.");
	} finally {
		await rm(tmp, { recursive: true, force: true });
	}
}

// Abort if the target has any data beyond the seed pet_self placeholder.
async function preflightTargetEmpty() {
	if (FORCE) return;
	const out = await $`bunx wrangler d1 execute ${TARGET_DB} --remote --json --command ${"SELECT COUNT(*) AS n FROM episodes;"}`.text();
	try {
		const parsed = JSON.parse(out) as { results: { n: number }[] }[];
		const n = parsed[0]?.results?.[0]?.n ?? 0;
		if (n > 0) {
			console.error(
				`Target ${TARGET_DB} already has ${n} episode rows. Re-run with --force to overwrite. (You probably don't want to.)`,
			);
			process.exit(2);
		}
	} catch {
		// Couldn't parse — best to abort than corrupt the target.
		console.error("Could not verify target is empty; pass --force to skip this check.");
		process.exit(2);
	}
}

// Export source D1, filter to Beto's subtree, rewrite pet_id, write SQL.
async function snapshotAndRewrite(tmp: string): Promise<string> {
	console.log("→ snapshotting source D1…");
	const rawDump = join(tmp, "source.sql");
	await $`bunx wrangler d1 export ${SOURCE_DB} --remote --no-schema --output ${rawDump}`.quiet();
	const sql = await readFile(rawDump, "utf8");

	console.log("→ filtering to Beto's subtree…");
	// Collect every id we keep so cascading inserts don't reference orphans.
	const keepIds = await collectBetoSubtreeIds();
	const filtered = filterAndRewrite(sql, keepIds);

	const out = join(tmp, "beto.upsert.sql");
	await writeFile(out, filtered, "utf8");
	console.log(`  wrote ${out} (${filtered.length} bytes)`);
	return out;
}

// Query source D1 for Beto's downstream ids (episodes, notes, prescriptions,
// doses, recordings, schedule_state, exams). We need these so the filter can
// keep their related rows even after pet_id is rewritten.
async function collectBetoSubtreeIds(): Promise<Set<string>> {
	const keep = new Set<string>();
	keep.add(BETO_PET_ID!);

	async function ids(sql: string): Promise<string[]> {
		const out = await $`bunx wrangler d1 execute ${SOURCE_DB} --remote --json --command ${sql}`.text();
		try {
			const parsed = JSON.parse(out) as { results: { id: string }[] }[];
			return parsed[0]?.results?.map((r) => r.id) ?? [];
		} catch {
			return [];
		}
	}

	const episodes = await ids(`SELECT id FROM episodes WHERE pet_id = '${BETO_PET_ID}';`);
	for (const id of episodes) keep.add(id);

	if (episodes.length > 0) {
		const epList = episodes.map((id) => `'${id}'`).join(",");
		const childTables = [
			"notes",
			"prescriptions",
			"doses",
			"schedule_state",
			"recordings",
			"episode_insights",
			"exams",
		];
		for (const t of childTables) {
			for (const id of await ids(
				`SELECT id FROM ${t} WHERE episode_id IN (${epList});`,
			)) {
				keep.add(id);
			}
		}
		// exam_metrics is keyed on exam_id; collect via the kept exam ids.
		// recording_chunks is keyed on recording_id; same.
	}

	console.log(`  keeping ${keep.size} ids transitively reachable from ${BETO_PET_ID}`);
	return keep;
}

// Stream through the SQL dump line by line; keep INSERTs whose primary key
// is in keepIds OR whose foreign key (pet_id / episode_id / exam_id /
// recording_id) points at a kept id. Rewrite pet_id values to pet_self.
function filterAndRewrite(sql: string, keepIds: Set<string>): string {
	const out: string[] = [];
	for (const rawLine of sql.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		if (line.startsWith("--")) continue;
		if (/^(BEGIN|COMMIT|ROLLBACK|PRAGMA|CREATE|DROP|ALTER)\b/i.test(line)) {
			continue;
		}
		if (!/^INSERT\s+INTO\b/i.test(line)) continue;
		// Skip SQLite internals.
		if (/INSERT\s+INTO\s+"?(sqlite_sequence|_cf_METADATA)"?/i.test(line)) {
			continue;
		}
		// Decide whether this insert references anything in keepIds. Cheap
		// approximation: if any kept id literal appears in the line, keep it.
		// We're optimizing for "false positives are fine, false negatives
		// orphan rows" — orphan rows then fail at apply time due to FKs.
		let keep = false;
		for (const id of keepIds) {
			if (line.includes(`'${id}'`)) {
				keep = true;
				break;
			}
		}
		if (!keep) continue;

		// Rewrite the legacy pet id → pet_self.
		const rewritten = line.replaceAll(`'${BETO_PET_ID}'`, `'${TARGET_SELF_ID}'`);
		// Force upsert semantics so re-runs don't error on duplicate ids.
		out.push(rewritten.replace(/^INSERT\s+INTO/i, "INSERT OR REPLACE INTO"));
	}
	return out.join("\n") + "\n";
}

async function applyToTarget(file: string) {
	console.log("→ applying to target D1…");
	await $`bunx wrangler d1 execute ${TARGET_DB} --remote --file ${file}`;
	console.log("  ✓ target D1 loaded");
}

async function mirrorR2() {
	console.log("→ mirroring R2 files…");
	// Pull the list of r2_keys from the target D1 (post-load).
	const out = await $`bunx wrangler d1 execute ${TARGET_DB} --remote --json --command ${"SELECT id, r2_key FROM files;"}`.text();
	let keys: { id: string; r2_key: string }[] = [];
	try {
		const parsed = JSON.parse(out) as {
			results: { id: string; r2_key: string }[];
		}[];
		keys = parsed[0]?.results ?? [];
	} catch {
		console.warn("  could not parse file list; skipping R2 mirror");
		return;
	}
	console.log(`  ${keys.length} files to mirror`);
	let done = 0;
	for (const { r2_key } of keys) {
		const tmp = `/tmp/tama-mig-${Date.now()}-${done}.bin`;
		try {
			await $`bunx wrangler r2 object get ${SOURCE_BUCKET}/${r2_key} --file ${tmp} --remote`.quiet();
			await $`bunx wrangler r2 object put ${TARGET_BUCKET}/${r2_key} --file ${tmp} --remote`.quiet();
			done++;
			if (done % 5 === 0) {
				console.log(`  mirrored ${done}/${keys.length}`);
			}
		} catch (err) {
			console.warn(`  ! failed to mirror ${r2_key}: ${(err as Error).message}`);
		} finally {
			await rm(tmp, { force: true });
		}
	}
	console.log(`  ✓ mirrored ${done} files`);
}

async function verifyCounts() {
	console.log("→ verifying row counts source vs target…");
	const tables = [
		"pets",
		"episodes",
		"notes",
		"prescriptions",
		"doses",
		"schedule_state",
		"recordings",
		"episode_insights",
		"exams",
		"exam_metrics",
	];
	let drift = false;
	for (const t of tables) {
		const where =
			t === "pets"
				? `id = '${TARGET_SELF_ID}'`
				: t === "episodes"
					? `pet_id = '${TARGET_SELF_ID}'`
					: "1=1";
		const srcWhere =
			t === "pets"
				? `id = '${BETO_PET_ID}'`
				: t === "episodes"
					? `pet_id = '${BETO_PET_ID}'`
					: "1=1";
		const src = await count(SOURCE_DB, `SELECT COUNT(*) AS n FROM ${t} WHERE ${srcWhere};`);
		const tgt = await count(TARGET_DB, `SELECT COUNT(*) AS n FROM ${t} WHERE ${where};`);
		const tag = src === tgt ? "✓" : "✗";
		console.log(`  ${tag} ${t}: src=${src} target=${tgt}`);
		if (src !== tgt) drift = true;
	}
	if (drift) {
		console.warn(
			"\n! row counts diverge — inspect manually before declaring done.",
		);
	}
}

async function count(db: string, sql: string): Promise<number> {
	const out = await $`bunx wrangler d1 execute ${db} --remote --json --command ${sql}`.text();
	try {
		const parsed = JSON.parse(out) as { results: { n: number }[] }[];
		return parsed[0]?.results?.[0]?.n ?? 0;
	} catch {
		return -1;
	}
}

async function mkdtempPrefix(): Promise<string> {
	const dir = join(
		tmpdir(),
		`tama-migrate-beto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
	);
	await mkdir(dir, { recursive: true });
	return dir;
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
