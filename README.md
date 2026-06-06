# Tama

An agent for your pet to live a better life. One pet, one agent, one deploy.

This repo is a **template**. You fork it, ask a coding-agent (Studio,
Claude Code, …) to adopt it for *your* pet, and deploy it to your own
Cloudflare account. The deployed worker is the agent: dashboard at `/`,
an ambient pixel companion at `/companion`, MCP server at `/mcp`. Free, MIT,
your data lives in your account — we never see it.

→ Landing: <https://tama.vet>
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
- **D1** (`api/db/schema.ts`) — singleton `pets` row + notes / prescriptions /
  doses / schedule_state / recordings / exams / metrics / vet_visits /
  vaccines / symptoms. Accessed via Drizzle ORM.
- **R2** — uploaded files (the Assets library: exam PDFs, vaccine cards,
  audio chunks, per-pet sprite pack).
- **Cloudflare AI Gateway** — routes Anthropic (vision extraction, exam
  parsing, asset classification, character sheet) and Perplexity (vet
  research). No API keys live in the Worker; the gateway holds BYOK.
- **Workers AI** — img2img for the raster sprite pipeline. Free tier covers a
  one-time adopt run. (The procedural SVG sprite path is instant + free.)
- **React UI** (`web/`) — bundled to a single HTML by Vite. Three top-level
  apps (Pet / Timeline / Timetable) + exams, companion, and sprite-lab, all
  served from the same Worker.

The repo is single-pet by design — there are no episodes; every record hangs
off the singleton `pet_self` and the **timeline** is a query-time merge across
the typed tables. No multi-tenant plumbing, no pet picker, no "which pet"
question to ever ask.

To explore with realistic data: `bun run seed:example` loads a synthetic
example pet ("Pixel", an anemia-recovery case). To pull template updates into
a fork: `bun run update` (see [docs/UPDATING.md](./docs/UPDATING.md)).

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
| `app_pet` / `app_timeline` / `app_timetable` | The three top-level apps      |
| `pet_profile` / `pet_update`| Read / patch the singleton pet                |
| `pet_enrich`                | Perplexity breed/condition research           |
| `pet_summary_refresh`       | Regenerate the one evolving health summary    |
| `pet_sprite_generate` / `pet_sprite_svg_generate` | Raster / SVG 6-state sprite pack |
| `sprite_compare`            | Both sprite methods side by side (sprite-lab) |
| `timeline_get`              | The merged continuous timeline                |
| `timeline_note_add`         | Add a free-form timeline note                 |
| `vet_visit_add` / `_list`   | Log / read vet visits                         |
| `vaccine_add` / `_list`     | Log / read vaccinations                       |
| `symptom_add` / `_resolve` / `_list` | Log / resolve / read symptoms        |
| `asset_upload` / `asset_list` | Drop any file → classified into the timeline |
| `prescription_upload` / `_create` / `_update` / `_list` / `_delete` | Prescriptions |
| `timetable_get`             | Derived live timetable for next N hours       |
| `dose_log` / `dose_update`  | Log given / skipped / undone                  |
| `schedule_state_list` / `_delete` | Read / remove live item state           |
| `timetable_snooze` / `_set_anchor` / `_set_duration` / `_stop_item` | Per-item adjustments |
| `recording_*`               | Audio chunked upload → whisper → summary      |
| `exam_upload` / `_paste` / `_get` / `_list` / `_update` / `_delete` | Lab exams |
| `exam_metric_series`        | Chart-shaped per-metric time series           |
| `vet_research`              | Perplexity with auto-attached pet + meds context |
| `push_*`                    | VAPID key, subscribe, unsubscribe, test       |

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
