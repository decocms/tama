# Tama

An agent for your pet to live a better life. One pet, one agent, one deploy.

This repo is a **template**. You fork it, ask a coding-agent (Studio,
Claude Code, …) to adopt it for *your* pet, and deploy it to your own
Cloudflare account. The deployed worker is the agent: dashboard at `/`,
an ambient pixel companion at `/companion`, MCP server at `/mcp`. Free, MIT,
your data lives in your account — we never see it.

→ Landing: <https://tama.deco-ceo.workers.dev> *(coming soon)*
→ Demo: <https://tama-example.deco-ceo.workers.dev> *(coming soon)*

## What you get

- **Medical log** — upload exams (PDF or photo); Claude vision extracts every
  parameter, maps each to a canonical taxonomy (so "TGP" and "ALT" land in
  the same bucket), and charts evolution over time. Prescription photos
  become a live timetable with dose logging and push reminders.
- **An agent for your pet** — `/mcp` exposes the whole surface as MCP tools.
  Studio imports it and chat becomes admin: "Did I give Beto his Prelone?"
  "What was his hemoglobin trend?" "Look up Sucralfate side effects."
- **A pixel companion** — `/companion` is a tiny pixel face that lives on your
  home screen (PWA). Generated from a photo via a two-pass img2img pipeline:
  Claude reads the photo and builds a character sheet, then Workers AI
  generates 6 emotion variants (idle, happy, hungry, pill-time, sad,
  sleeping) that hold the same identity. Reacts ambient to dose schedule.

## How to adopt this for your pet

The intended path is **inside Studio**: studio.decocms.com → Import from
GitHub → paste the URL of your fork. Studio's coding-agent reads
`AGENTS.md` and walks you through customize → commit → deploy → operate.
No terminal needed.

If you prefer a local IDE, the same flow works in Claude Code (invoke the
[`/adopt-pet`](./.claude/skills/adopt-pet.md) skill), Cursor, or anything
else that honors `AGENTS.md`. Or read [AGENTS.md](./AGENTS.md) yourself
and do it by hand — every step is a real shell command.

## Architecture

- **Cloudflare Worker** (`api/main.cf.ts`) — MCP server, REST endpoints,
  cron-driven push notifications, static asset serving.
- **D1** (`api/db/schema.ts`) — singleton `pets` row + episodes / notes /
  prescriptions / doses / schedule_state / recordings / exams / metrics.
  Accessed via Drizzle ORM.
- **R2** — uploaded files (prescription photos, exam PDFs, audio chunks,
  per-pet sprite pack).
- **Cloudflare AI Gateway** — routes Anthropic (vision extraction, exam
  parsing, character sheet) and Perplexity (vet research). No API keys
  live in the Worker; the gateway holds BYOK.
- **Workers AI** — img2img for the sprite pipeline. Free tier covers a
  one-time adopt run.
- **React UI** (`web/`) — bundled to a single HTML by Vite. Dashboard,
  exams page, episode dashboard, companion view all served from the
  same Worker.

The repo is single-pet by design — every history table is keyed on
`episode_id`; episodes hang off the singleton `pet_self`. No multi-tenant
plumbing, no pet picker, no "which pet" question to ever ask.

## Local development

After adopting the template for your pet:

```bash
bun install
bun run db:migrate:local
bun run dev
```

`vite build --watch` rebuilds the UI; `wrangler dev` serves the worker
at `http://localhost:8787`. Miniflare emulates D1 + R2 with persistence.

## Deploy

```bash
# Provision (once)
wrangler d1 create tama-<petslug>          # patch wrangler.toml database_id
wrangler r2 bucket create tama-<petslug>-files

# Secrets (once)
bun run scripts/generate-vapid.ts          # generate VAPID keypair
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT          # mailto:you@example.com
wrangler secret put ANTHROPIC_API_KEY

# Deploy (every time)
bun run db:migrate:remote
bun run deploy
```

## Migrating from the legacy `myvet` shape

If you ran the pre-tama version of this repo on a Cloudflare account and
want to bring its data forward:

```bash
SOURCE_DB=myvet TARGET_DB=tama-<petslug> \
SOURCE_BUCKET=myvet-files TARGET_BUCKET=tama-<petslug>-files \
BETO_PET_ID=pet_xxxxx \
bun scripts/migrate-beto.ts
```

The script snapshots the source D1, filters to one pet's subtree,
rewrites `pet_id` values to `pet_self`, mirrors R2 files, and
sanity-checks row counts. See [`scripts/migrate-beto.ts`](./scripts/migrate-beto.ts).

## MCP tools

Every tool acts on **the** pet (no `petId` argument anywhere).

| Tool                        | What it does                                  |
| --------------------------- | --------------------------------------------- |
| `pet_profile`               | Read the singleton pet                        |
| `pet_update`                | Patch pet fields                              |
| `pet_enrich`                | Perplexity research → enrichmentJson          |
| `pet_sprite_generate`       | Two-pass img2img → 6-state sprite pack in R2  |
| `episode_start` / `_end`    | Lifecycle for a care episode                  |
| `episode_get` / `_list`     | Read                                          |
| `episode_add_note`          | Free-text or chatlog note                     |
| `episode_update` / `_delete`| Patch / soft-delete                           |
| `prescription_upload`       | Vision-extract a photo → draft prescription   |
| `prescription_create`       | Structured (no OCR) prescription              |
| `prescription_update`       | Edit / confirm / drop schedule items          |
| `prescription_list` / `_delete` | Read / hard-delete (cascades to schedule)|
| `timetable_get`             | Derived live timetable for next N hours       |
| `dose_log` / `dose_update`  | Log given / skipped / undone                  |
| `schedule_state_list` / `_delete` | Read / remove live item state           |
| `timetable_snooze` / `_set_anchor` / `_set_duration` / `_stop_item` | Per-item adjustments |
| `recording_*`               | Audio chunked upload → whisper → summary      |
| `exam_upload` / `_paste`    | PDF/photo/text → AI-extracted metrics         |
| `exam_get` / `_list` / `_update` / `_delete` | Exam CRUD                    |
| `exam_metric_series`        | Chart-shaped per-metric time series           |
| `episode_insights`          | LLM-generated bullet summary of the episode   |
| `vet_research`              | Perplexity with auto-attached pet + episode context |
| `push_*`                    | VAPID key, subscribe, unsubscribe, test       |
| `dashboard`                 | Studio inline dashboard surface               |

## Tests

```bash
bun test          # unit tests (timetable + exam-metric chunking + state)
bun run check     # tsc --noEmit
bun run ci:check  # biome
```

## Non-goals

- Multi-pet households on one deploy. Two pets → two forks → two deploys.
  See [the plan doc](./docs/) for the rationale.
- Selling this as a managed service. The deployment story is fork-and-run.
- Native iOS/Android apps. PWA only.

## Acknowledgements

Built on [deco studio](https://studio.decocms.com). The MCP runtime, the
agent surface, and the "Studio is the full lifecycle IDE" thesis come
from there. Tama is the personal-use side of the same primitives.

[See AGENTS.md](./AGENTS.md) for the adopt lifecycle.
[See docs/](./docs/) for the open feature requests to the Studio team.
