#!/usr/bin/env bun
//
// Ingest real lab-exam PDFs through the running worker's `exam_upload` MCP
// tool, so Claude vision extracts every parameter and the metrics get charted
// (e.g. Beto's hemoglobin trend across two hemograms). Unlike the D1 migration,
// this needs the worker running because extraction goes through the AI Gateway.
//
// Usage:
//   bun run dev   # in another terminal (worker on :8788)
//   bun run scripts/ingest-exams.ts ~/Downloads/roberto_hg130526.pdf ...
//
// With no args it defaults to Beto's bloodwork set in ~/Downloads.
//
// Env: WORKER_URL (default http://localhost:8788)

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";

const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:8788";

const DEFAULTS = [
	"roberto_hg130526.pdf",
	"roberto_hg170526.pdf",
	"roberto_bq130526.pdf",
	"roberto_bq17052026.pdf",
	"roberto_pfs130526.pdf",
].map((f) => join(homedir(), "Downloads", f));

let rpcId = 1;

async function callTool(
	name: string,
	args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const res = await fetch(`${WORKER_URL}/api/mcp`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: rpcId++,
			method: "tools/call",
			params: { name, arguments: args },
		}),
	});
	if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${await res.text()}`);
	const raw = await res.text();
	const dataLine = raw
		.split("\n")
		.find((l) => l.startsWith("data:"))
		?.slice(5)
		.trim();
	const json = dataLine ? JSON.parse(dataLine) : JSON.parse(raw);
	if (json.error) throw new Error(json.error.message ?? "MCP error");
	const result = json.result;
	if (result?.isError) {
		const text =
			result.content?.find(
				(c: { type: string; text?: string }) => c.type === "text",
			)?.text ?? "Tool error";
		throw new Error(text);
	}
	return result?.structuredContent ?? {};
}

function mimeFor(path: string): string {
	const lower = path.toLowerCase();
	if (lower.endsWith(".pdf")) return "application/pdf";
	if (lower.endsWith(".png")) return "image/png";
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".webp")) return "image/webp";
	return "application/octet-stream";
}

async function main() {
	const paths = process.argv.slice(2);
	const files = paths.length ? paths : DEFAULTS;
	console.log(`Ingesting ${files.length} exam file(s) → ${WORKER_URL}`);

	for (const path of files) {
		const label = basename(path);
		try {
			const bytes = await readFile(path);
			const base64 = bytes.toString("base64");
			process.stdout.write(`  • ${label} … `);
			const out = (await callTool("exam_upload", {
				imageBase64: base64,
				mimeType: mimeFor(path),
				originalName: label,
			})) as {
				exam?: { id: string; performedAt?: string; labName?: string };
				metrics?: unknown[];
				pendingReviewCount?: number;
			};
			// Confirm it — these are real historical exams, and the metric-trend
			// charts only plot confirmed exams. Without this they'd stay "draft"
			// and never show up in the graphs.
			if (out.exam?.id) {
				await callTool("exam_update", {
					examId: out.exam.id,
					status: "confirmed",
				});
			}
			console.log(
				`ok — exam ${out.exam?.id ?? "?"} (${out.exam?.performedAt ?? "no date"}), ${out.metrics?.length ?? 0} metrics, confirmed`,
			);
		} catch (err) {
			console.log(`FAILED: ${(err as Error).message.split("\n")[0]}`);
		}
	}
	console.log(
		"\n✓ Done. Open /exams to confirm the hemoglobin trend, then /timeline to see them in context.",
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
