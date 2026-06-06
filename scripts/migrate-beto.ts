#!/usr/bin/env bun
//
// Migrate Beto's real production data (legacy episode-era `myvet` deploy) into
// the new episode-free TIMELINE shape, loaded into a LOCAL D1 by default so you
// can test the new Tama against real data on a throwaway branch.
//
// Strategy (robust to schema drift): for every table we pull Beto's rows from
// prod as JSON, then insert only the columns that ALSO exist in the new local
// schema (column intersection). That automatically drops `episode_id` (gone in
// the new schema) and re-keys everything onto the singleton `pet_self`. No
// fragile SQL-dump surgery.
//
//   prod (remote, episodes) ──JSON──▶ transform ──SQL──▶ local D1 (timeline)
//
// Tables: pets (profile only), notes, prescriptions, doses, schedule_state,
// recordings, recording_chunks, exams, exam_metrics, files. R2 blobs are
// mirrored best-effort so exam PDFs / audio still resolve locally.
//
// The local DB is wiped of pet data first (single-pet: there's one pet_self),
// so re-running is safe and idempotent.
//
// Usage:
//   bun run scripts/migrate-beto.ts                 # → local D1
//   BETO_PET_ID=pet_xxx bun run scripts/migrate-beto.ts
//   TARGET_REMOTE=1 TARGET_DB=tama-beto bun run scripts/migrate-beto.ts   # → a remote target
//
// After it runs, ingest the real bloodwork PDFs for the hemoglobin trend:
//   bun run scripts/ingest-exams.ts ~/Downloads/roberto_hg130526.pdf ...

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const SOURCE_DB = process.env.SOURCE_DB ?? "myvet";
const SOURCE_BUCKET = process.env.SOURCE_BUCKET ?? "myvet-files";
const TARGET_DB = process.env.TARGET_DB ?? "myvet";
const TARGET_BUCKET = process.env.TARGET_BUCKET ?? "myvet-files";
const TARGET_REMOTE = process.env.TARGET_REMOTE === "1";
const BETO_PET_ID = process.env.BETO_PET_ID ?? "pet_f280f94409f441ae";
const PET_SELF_ID = "pet_self";

const targetFlag = TARGET_REMOTE ? "--remote" : "--local";

// ---- wrangler d1 helpers ----

// biome-ignore lint/suspicious/noExplicitAny: D1 rows are dynamic
async function query(db: string, remote: boolean, sql: string): Promise<any[]> {
	const flag = remote ? "--remote" : "--local";
	const out =
		await $`bunx wrangler d1 execute ${db} ${flag} --json --command ${sql}`
			.quiet()
			.text();
	try {
		const parsed = JSON.parse(out) as { results: unknown[] }[];
		return (parsed[0]?.results as unknown[]) ?? [];
	} catch {
		return [];
	}
}

async function targetColumns(table: string): Promise<string[]> {
	const rows = await query(
		TARGET_DB,
		TARGET_REMOTE,
		`SELECT name FROM pragma_table_info('${table}');`,
	);
	return rows.map((r) => (r as { name: string }).name);
}

// ---- SQL value serialization ----

// biome-ignore lint/suspicious/noExplicitAny: serializing arbitrary cell values
function sqlVal(v: any): string {
	if (v === null || v === undefined) return "NULL";
	if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
	if (typeof v === "boolean") return v ? "1" : "0";
	return `'${String(v).replaceAll("'", "''")}'`;
}

// Build an INSERT OR REPLACE keeping only columns present in the target table.
function insertRow(
	table: string,
	// biome-ignore lint/suspicious/noExplicitAny: dynamic row
	row: Record<string, any>,
	cols: string[],
	overrides: Record<string, string> = {},
): string {
	const keep = cols.filter((c) => c in row || c in overrides);
	const names = keep.map((c) => `"${c}"`).join(", ");
	const vals = keep
		.map((c) => (c in overrides ? overrides[c] : sqlVal(row[c])))
		.join(", ");
	return `INSERT OR REPLACE INTO "${table}" (${names}) VALUES (${vals});`;
}

function idList(ids: string[]): string {
	return ids.map((id) => `'${id.replaceAll("'", "''")}'`).join(",");
}

async function main() {
	console.log(
		`Migrating Beto (${BETO_PET_ID}) from ${SOURCE_DB} (remote) → ${TARGET_DB} (${targetFlag}) as ${PET_SELF_ID}`,
	);

	// 1. Resolve Beto's episode ids (the join key for child tables in prod).
	const episodes = await query(
		SOURCE_DB,
		true,
		`SELECT id FROM episodes WHERE pet_id = '${BETO_PET_ID}';`,
	);
	const epIds = episodes.map((e) => (e as { id: string }).id);
	console.log(`  episodes: ${epIds.length}`);
	if (epIds.length === 0) {
		throw new Error("No episodes found for Beto in prod — wrong BETO_PET_ID?");
	}
	const epIn = idList(epIds);

	// 2. Pull prod rows per table.
	const petRows = await query(
		SOURCE_DB,
		true,
		`SELECT * FROM pets WHERE id = '${BETO_PET_ID}';`,
	);
	const beto = petRows[0];
	if (!beto) throw new Error("Beto pet row not found");

	const notes = await query(
		SOURCE_DB,
		true,
		`SELECT * FROM notes WHERE episode_id IN (${epIn});`,
	);
	const prescriptions = await query(
		SOURCE_DB,
		true,
		`SELECT * FROM prescriptions WHERE episode_id IN (${epIn});`,
	);
	const doses = await query(
		SOURCE_DB,
		true,
		`SELECT * FROM doses WHERE episode_id IN (${epIn});`,
	);
	const scheduleState = await query(
		SOURCE_DB,
		true,
		`SELECT * FROM schedule_state WHERE episode_id IN (${epIn});`,
	);
	const recordings = await query(
		SOURCE_DB,
		true,
		`SELECT * FROM recordings WHERE episode_id IN (${epIn});`,
	);
	const exams = await query(
		SOURCE_DB,
		true,
		`SELECT * FROM exams WHERE episode_id IN (${epIn});`,
	);

	const recIds = recordings.map((r) => (r as { id: string }).id);
	const examIds = exams.map((x) => (x as { id: string }).id);
	const chunks = recIds.length
		? await query(
				SOURCE_DB,
				true,
				`SELECT * FROM recording_chunks WHERE recording_id IN (${idList(recIds)});`,
			)
		: [];
	const metrics = examIds.length
		? await query(
				SOURCE_DB,
				true,
				`SELECT * FROM exam_metrics WHERE exam_id IN (${idList(examIds)});`,
			)
		: [];

	// Files referenced by anything we kept.
	const fileIds = new Set<string>();
	for (const r of recordings)
		if ((r as { original_file_id?: string }).original_file_id)
			fileIds.add((r as { original_file_id: string }).original_file_id);
	for (const c of chunks)
		if ((c as { file_id?: string }).file_id)
			fileIds.add((c as { file_id: string }).file_id);
	for (const x of exams)
		if ((x as { file_id?: string }).file_id)
			fileIds.add((x as { file_id: string }).file_id);
	for (const p of prescriptions)
		if ((p as { file_id?: string }).file_id)
			fileIds.add((p as { file_id: string }).file_id);
	if ((beto as { photo_file_id?: string }).photo_file_id)
		fileIds.add((beto as { photo_file_id: string }).photo_file_id);
	const files = fileIds.size
		? await query(
				SOURCE_DB,
				true,
				`SELECT * FROM files WHERE id IN (${idList([...fileIds])});`,
			)
		: [];

	console.log(
		`  pulled: ${notes.length} notes, ${prescriptions.length} rx, ${doses.length} doses, ${scheduleState.length} schedule_state, ${recordings.length} recordings, ${chunks.length} chunks, ${exams.length} exams, ${metrics.length} metrics, ${files.length} files`,
	);

	// 3. Target column sets.
	const cols = {
		pets: await targetColumns("pets"),
		notes: await targetColumns("notes"),
		prescriptions: await targetColumns("prescriptions"),
		doses: await targetColumns("doses"),
		schedule_state: await targetColumns("schedule_state"),
		recordings: await targetColumns("recordings"),
		recording_chunks: await targetColumns("recording_chunks"),
		exams: await targetColumns("exams"),
		exam_metrics: await targetColumns("exam_metrics"),
		files: await targetColumns("files"),
	};

	// 4. Build the SQL: wipe pet data, set the profile, insert everything.
	const sql: string[] = ["PRAGMA defer_foreign_keys = TRUE;"];

	// Clean slate (single-pet). Order children-first to respect FKs.
	for (const t of [
		"exam_metrics",
		"recording_chunks",
		"doses",
		"schedule_state",
		"prescriptions",
		"notes",
		"recordings",
		"exams",
		"vet_visits",
		"vaccines",
		"symptoms",
		"files",
	]) {
		sql.push(`DELETE FROM "${t}";`);
	}

	// Beto's profile onto the singleton (UPDATE, keep id = pet_self).
	const profileCols = cols.pets.filter(
		(c) => c !== "id" && c !== "created_at" && c in (beto as object),
	);
	if (profileCols.length) {
		const sets = profileCols
			.map((c) => `"${c}" = ${sqlVal((beto as Record<string, unknown>)[c])}`)
			.join(", ");
		sql.push(`UPDATE "pets" SET ${sets} WHERE id = '${PET_SELF_ID}';`);
	}

	const petOverride = { pet_id: `'${PET_SELF_ID}'` };
	for (const r of notes) sql.push(insertRow("notes", r, cols.notes, petOverride));
	for (const r of prescriptions)
		sql.push(insertRow("prescriptions", r, cols.prescriptions, petOverride));
	for (const r of doses) sql.push(insertRow("doses", r, cols.doses, petOverride));
	for (const r of scheduleState)
		sql.push(insertRow("schedule_state", r, cols.schedule_state, petOverride));
	for (const r of recordings)
		sql.push(insertRow("recordings", r, cols.recordings, petOverride));
	for (const r of exams) sql.push(insertRow("exams", r, cols.exams, petOverride));
	// chunks/metrics/files are not pet-keyed.
	for (const r of chunks)
		sql.push(insertRow("recording_chunks", r, cols.recording_chunks));
	for (const r of metrics)
		sql.push(insertRow("exam_metrics", r, cols.exam_metrics));
	for (const r of files) sql.push(insertRow("files", r, cols.files));

	// 5. Apply.
	const tmp = await mkdtemp(join(tmpdir(), "beto-mig-"));
	const file = join(tmp, "beto.sql");
	await writeFile(file, sql.join("\n"), "utf8");
	console.log(`  applying ${sql.length} statements → ${TARGET_DB} ${targetFlag}…`);
	await $`bunx wrangler d1 execute ${TARGET_DB} ${targetFlag} --file ${file}`.quiet();
	await rm(tmp, { recursive: true, force: true });

	// 6. Mirror R2 blobs (best-effort).
	if (files.length) {
		console.log(`  mirroring ${files.length} R2 files…`);
		let ok = 0;
		for (const f of files) {
			const key = (f as { r2_key?: string }).r2_key;
			if (!key) continue;
			const blobTmp = join(tmpdir(), `beto-r2-${ok}-${key.replaceAll("/", "_")}`);
			try {
				await $`bunx wrangler r2 object get ${SOURCE_BUCKET}/${key} --file ${blobTmp} --remote`.quiet();
				await $`bunx wrangler r2 object put ${TARGET_BUCKET}/${key} --file ${blobTmp} ${targetFlag}`.quiet();
				ok++;
			} catch (err) {
				console.warn(`    ! ${key}: ${(err as Error).message.split("\n")[0]}`);
			} finally {
				await rm(blobTmp, { force: true });
			}
		}
		console.log(`    mirrored ${ok}/${files.length}`);
	}

	console.log("\n✓ Beto migrated. Start the worker and open / to see his timeline.");
	console.log(
		"  Next: bun run scripts/ingest-exams.ts ~/Downloads/roberto_hg130526.pdf ~/Downloads/roberto_hg170526.pdf ~/Downloads/roberto_bq130526.pdf ~/Downloads/roberto_bq17052026.pdf",
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
