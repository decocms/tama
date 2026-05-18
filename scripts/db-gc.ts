#!/usr/bin/env bun

// scripts/db-gc.ts
//
// Garbage-collect orphan files rows in D1 (local + remote):
//   1. Rows whose R2 object doesn't actually exist (key returns "not exist").
//   2. Rows not referenced by any prescriptions / recordings / recording_chunks
//      AND whose R2 object is missing.
//
// Doesn't touch real, referenced files. Doesn't delete R2 objects (those
// already don't exist for any row we drop).
//
// Run with: bun run db:gc
// Add --dry-run to preview without deleting.

import { $ } from "bun";

const DB_NAME = "myvet";
const BUCKET = "myvet-files";

const dryRun = process.argv.includes("--dry-run");

async function main() {
	for (const env of ["local", "remote"] as const) {
		console.log(`\n=== ${env.toUpperCase()} ===`);
		await gc(env);
	}
	console.log(dryRun ? "\n(dry run — no deletes performed)" : "\n✓ GC complete");
}

interface FileRow {
	id: string;
	r2_key: string;
}

async function gc(env: "local" | "remote") {
	const rows = await queryFiles(env);
	console.log(`  ${rows.length} file row(s)`);
	if (rows.length === 0) return;

	const referenced = await queryReferencedFileIds(env);

	const orphansMissingR2: FileRow[] = [];
	const referencedMissingR2: FileRow[] = [];

	for (const row of rows) {
		const exists = await r2Exists(env, row.r2_key);
		if (exists) continue;
		if (referenced.has(row.id)) {
			referencedMissingR2.push(row);
		} else {
			orphansMissingR2.push(row);
		}
	}

	console.log(`  ${orphansMissingR2.length} orphan(s) (unreferenced + R2 missing)`);
	if (referencedMissingR2.length > 0) {
		console.log(
			`  ${referencedMissingR2.length} referenced row(s) with missing R2 — KEPT (something in the DB points at them)`,
		);
		for (const r of referencedMissingR2) {
			console.log(`    · ${r.id} (${r.r2_key})`);
		}
	}

	if (orphansMissingR2.length === 0) {
		console.log("  ✓ nothing to delete");
		return;
	}

	if (dryRun) {
		for (const r of orphansMissingR2.slice(0, 10)) {
			console.log(`    would delete: ${r.id} (${r.r2_key})`);
		}
		if (orphansMissingR2.length > 10) {
			console.log(`    … and ${orphansMissingR2.length - 10} more`);
		}
		return;
	}

	const ids = orphansMissingR2.map((r) => `'${r.id.replace(/'/g, "''")}'`);
	// Chunk to keep SQL statement under any limit.
	for (let i = 0; i < ids.length; i += 100) {
		const slice = ids.slice(i, i + 100).join(",");
		const flag = env === "local" ? "--local" : "--remote";
		await $`bunx wrangler d1 execute ${DB_NAME} ${flag} --command ${`DELETE FROM files WHERE id IN (${slice})`}`.quiet();
	}
	console.log(`  ✓ deleted ${orphansMissingR2.length} orphan row(s)`);
}

async function r2Exists(
	env: "local" | "remote",
	key: string,
): Promise<boolean> {
	const flag = env === "local" ? "--local" : "--remote";
	// Use a tmp path we discard — wrangler doesn't have a HEAD-equivalent.
	const tmp = `/tmp/r2-probe-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`;
	try {
		await $`bunx wrangler r2 object get ${BUCKET}/${key} ${flag} --file ${tmp}`.quiet();
		await $`rm -f ${tmp}`.quiet();
		return true;
	} catch (err) {
		// biome-ignore lint/suspicious/noExplicitAny: bun shell error has stderr
		const e = err as any;
		const stderr = (
			e?.stderr?.toString?.() ??
			e?.stdout?.toString?.() ??
			e?.message ??
			""
		).toString();
		if (/specified key does not exist/i.test(stderr)) return false;
		// Any other failure: treat conservatively as "exists" so we don't
		// nuke rows on a transient network glitch.
		return true;
	}
}

async function queryFiles(env: "local" | "remote"): Promise<FileRow[]> {
	const flag = env === "local" ? "--local" : "--remote";
	const out =
		await $`bunx wrangler d1 execute ${DB_NAME} ${flag} --command ${"SELECT id, r2_key FROM files"} --json`.quiet();
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

async function queryReferencedFileIds(
	env: "local" | "remote",
): Promise<Set<string>> {
	const flag = env === "local" ? "--local" : "--remote";
	const sql =
		"SELECT file_id AS id FROM prescriptions WHERE file_id IS NOT NULL " +
		"UNION SELECT original_file_id AS id FROM recordings WHERE original_file_id IS NOT NULL " +
		"UNION SELECT file_id AS id FROM recording_chunks WHERE file_id IS NOT NULL";
	const out =
		await $`bunx wrangler d1 execute ${DB_NAME} ${flag} --command ${sql} --json`.quiet();
	const raw = out.stdout.toString();
	const start = raw.indexOf("[");
	if (start === -1) return new Set();
	try {
		const parsed = JSON.parse(raw.slice(start)) as Array<{
			results?: Array<{ id: string }>;
		}>;
		return new Set((parsed[0]?.results ?? []).map((r) => r.id));
	} catch {
		return new Set();
	}
}

await main();
