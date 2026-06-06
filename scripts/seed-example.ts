#!/usr/bin/env bun
// Seed the example pet "Pixel" — a synthetic dataset modeled on a real
// anemia case (the kind of trend Tama is built to track) but containing NO
// real pet's data. Safe to ship in the public template; powers `bun run dev`
// and the public demo deploy.
//
// NOT a migration and NOT run on fork — real forks start empty and use the
// setup flow. This is opt-in: `bun run seed:example` (local) or
// `bun run seed:example -- --remote` against a demo D1.
//
// Dates are computed relative to "now" so the timetable always looks alive
// (a couple of doses pending in the next hours, recent exams trending).

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const DB = process.env.SEED_DB ?? "myvet";
const REMOTE = process.argv.includes("--remote");

function id(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
const now = Date.now();
const DAY = 86_400_000;
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const q = (s: string | null) => (s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`);

const PET = "pet_self";

// ---- exams (anemia recovery trend) ----
type Metric = {
	key: string;
	name: string;
	value: number;
	unit: string;
	low: number;
	high: number;
	status: "normal" | "low" | "high";
};
const examDefs: { performedAt: number; lab: string; req: string; metrics: Metric[] }[] = [
	{
		performedAt: now - 21 * DAY,
		lab: "Example Vet Lab",
		req: "EX-1001",
		metrics: [
			{ key: "hemoglobin", name: "Hemoglobin", value: 8.5, unit: "g/dL", low: 12, high: 18, status: "low" },
			{ key: "hematocrit", name: "Hematocrit", value: 25, unit: "%", low: 37, high: 55, status: "low" },
			{ key: "albumin", name: "Albumin", value: 1.6, unit: "g/dL", low: 2.3, high: 3.3, status: "low" },
			{ key: "urea", name: "Urea (BUN)", value: 98, unit: "mg/dL", low: 11, high: 60, status: "high" },
			{ key: "creatinine", name: "Creatinine", value: 0.6, unit: "mg/dL", low: 0.5, high: 1.5, status: "normal" },
		],
	},
	{
		performedAt: now - 17 * DAY,
		lab: "Example Vet Lab",
		req: "EX-1042",
		metrics: [
			{ key: "hemoglobin", name: "Hemoglobin", value: 6.6, unit: "g/dL", low: 12, high: 18, status: "low" },
			{ key: "hematocrit", name: "Hematocrit", value: 20, unit: "%", low: 37, high: 55, status: "low" },
		],
	},
	{
		performedAt: now - 9 * DAY,
		lab: "Example Vet Lab",
		req: "EX-1099",
		metrics: [
			{ key: "hemoglobin", name: "Hemoglobin", value: 9.4, unit: "g/dL", low: 12, high: 18, status: "low" },
			{ key: "hematocrit", name: "Hematocrit", value: 28, unit: "%", low: 37, high: 55, status: "low" },
			{ key: "albumin", name: "Albumin", value: 2.1, unit: "g/dL", low: 2.3, high: 3.3, status: "low" },
		],
	},
];

const sql: string[] = ["PRAGMA defer_foreign_keys = TRUE;"];

// Clean slate for the singleton pet.
for (const t of [
	"exam_metrics",
	"exams",
	"doses",
	"schedule_state",
	"prescriptions",
	"notes",
	"vet_visits",
	"vaccines",
	"symptoms",
]) {
	if (t === "exam_metrics") {
		sql.push(`DELETE FROM exam_metrics;`);
	} else {
		sql.push(`DELETE FROM ${t} WHERE pet_id = '${PET}';`);
	}
}

// Pet profile.
sql.push(
	`UPDATE pets SET name='Pixel', species='dog', breed='Chihuahua', dob='6 years', weight_kg=4.1, timezone='America/Sao_Paulo', owner_notes='Recovering from regenerative anemia; sensitive stomach.', summary=${q(
		"Pixel is recovering well — hemoglobin has climbed from a low of 6.6 to 9.4 g/dL over the last two weeks. On Prednisolone daily; appetite improving. Watch for any return of lethargy or pale gums.",
	)}, summary_at='${iso(now - HOUR)}' WHERE id='${PET}';`,
);

// Exams + metrics.
for (const e of examDefs) {
	const examId = id("exam");
	sql.push(
		`INSERT INTO exams (id, pet_id, file_id, status, performed_at, lab_name, request_id, created_at) VALUES ('${examId}','${PET}',NULL,'confirmed','${iso(e.performedAt)}',${q(e.lab)},${q(e.req)},'${iso(e.performedAt)}');`,
	);
	for (const m of e.metrics) {
		sql.push(
			`INSERT INTO exam_metrics (id, exam_id, canonical_key, display_name, value_num, unit, ref_low, ref_high, status, pending_review, created_at) VALUES ('${id("em")}','${examId}',${q(m.key)},${q(m.name)},${m.value},${q(m.unit)},${m.low},${m.high},${q(m.status)},0,'${iso(e.performedAt)}');`,
		);
	}
}

// Prescription + live schedule_state (Prednisolone once daily) + dose history.
const rxId = id("rx");
const items = JSON.stringify([
	{ name: "Prednisolone", kind: "medication", dosage: "5mg", times: ["08:00"], frequencyHours: 24 },
	{ name: "Breakfast", kind: "meal", times: ["07:30"], frequencyHours: 24 },
]);
sql.push(
	`INSERT INTO prescriptions (id, pet_id, file_id, status, schedule_items_json, source_notes, created_at) VALUES ('${rxId}','${PET}',NULL,'confirmed',${q(items)},'From the discharge note','${iso(now - 18 * DAY)}');`,
);
// Anchor next Prednisolone ~3h from now so the timetable shows a pending dose.
const nextDose = now + 3 * HOUR;
sql.push(
	`INSERT INTO schedule_state (id, pet_id, item_key, display_name, kind, dosage, interval_hours, anchor_at, prescription_id, active, starts_at, created_at, updated_at) VALUES ('${id("ss")}','${PET}','prednisolone','Prednisolone','medication','5mg',24,'${iso(nextDose)}','${rxId}',1,'${iso(now - 18 * DAY)}','${iso(now - 18 * DAY)}','${iso(now)}');`,
);
sql.push(
	`INSERT INTO schedule_state (id, pet_id, item_key, display_name, kind, interval_hours, anchor_at, prescription_id, active, starts_at, created_at, updated_at) VALUES ('${id("ss")}','${PET}','breakfast','Breakfast','meal',24,'${iso(now + 18 * HOUR)}','${rxId}',1,'${iso(now - 18 * DAY)}','${iso(now - 18 * DAY)}','${iso(now)}');`,
);
// Recent given doses (last 5 days).
for (let d = 5; d >= 1; d--) {
	const at = iso(now - d * DAY + 8 * HOUR);
	sql.push(
		`INSERT INTO doses (id, pet_id, item_name, kind, actual_at, status, created_at) VALUES ('${id("dose")}','${PET}','Prednisolone','medication','${at}','given','${at}');`,
	);
}

// A vet visit, a vaccine, a symptom, a note.
sql.push(
	`INSERT INTO vet_visits (id, pet_id, visited_at, vet_name, clinic, reason, notes, created_at) VALUES ('${id("visit")}','${PET}','${iso(now - 21 * DAY)}','Dr. Example','Example Animal Hospital','Lethargy and pale gums','Diagnosed regenerative anemia; started Prednisolone.','${iso(now - 21 * DAY)}');`,
);
sql.push(
	`INSERT INTO vaccines (id, pet_id, name, administered_at, due_at, created_at) VALUES ('${id("vax")}','${PET}','Rabies','${iso(now - 120 * DAY)}','${iso(now + 245 * DAY)}','${iso(now - 120 * DAY)}');`,
);
sql.push(
	`INSERT INTO symptoms (id, pet_id, observed_at, description, severity, resolved_at, created_at) VALUES ('${id("sym")}','${PET}','${iso(now - 22 * DAY)}','Lethargic, not finishing meals','moderate','${iso(now - 12 * DAY)}','${iso(now - 22 * DAY)}');`,
);
sql.push(
	`INSERT INTO notes (id, pet_id, kind, content, created_at) VALUES ('${id("note")}','${PET}','general','Eating full breakfast again this morning and more playful. Gums look pinker.','${iso(now - 8 * DAY)}');`,
);

async function main() {
	const dir = await mkdtemp(join(tmpdir(), "tama-seed-"));
	const file = join(dir, "seed.sql");
	await writeFile(file, sql.join("\n"), "utf8");
	const flag = REMOTE ? "--remote" : "--local";
	console.log(`Seeding "Pixel" into ${DB} (${flag})…`);
	await $`bunx wrangler d1 execute ${DB} ${flag} --file ${file}`;
	await rm(dir, { recursive: true, force: true });
	console.log("✓ Example pet 'Pixel' seeded.");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
