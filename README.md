# Tama

An agent for your pet to live a better life. One pet, one agent, one deploy.

This repo is a **template**. You fork it, ask a coding-agent (Studio,
Claude Code, …) to set it up for *your* pet — creating an agent that knows
your pet — and deploy it to your own Cloudflare account. The deployed worker
is that agent: dashboard at `/`,
an ambient pixel companion at `/companion`, MCP server at `/mcp`. Free, MIT,
your data lives in your account — we never see it.

→ Landing: <https://tama.vet>
→ Live demo: <https://tama-example.deco-ceo.workers.dev> (Pixel, an anemia-recovery case)

> **Development flow (forks):** a live pet runs on a private fork that's just
> this template **plus one config commit**. Always change the **template
> first**, then `git checkout <fork> && git rebase tama` and
> `wrangler deploy -c wrangler.<pet>.toml` — never edit only the fork, so the
> template keeps advancing. Full loop + Beto specifics in
> [AGENTS.md](./AGENTS.md#development-flow--template--fork--deploy-read-this-first-when-iterating).

## What you get

- **Medical log** — upload exams (PDF or photo); Claude vision extracts every
  parameter, maps each to a canonical taxonomy (so "TGP" and "ALT" land in
  the same bucket), and charts evolution over time. Prescription photos
  become a live timetable with dose logging and push reminders.
- **An agent for your pet** — `/mcp` exposes the whole surface as MCP tools.
  Studio imports it and chat becomes admin: "Did I give Beto his Prelone?"
  "What was his hemoglobin trend?" "Look up Sucralfate side effects."
- **A pixel companion** — `/companion` is a tiny pixel face that lives on your
  home screen (PWA). Generated from a photo by a single Claude vision call that
  reads the photo into a character sheet (coat colors, ear shape, markings),
  then a deterministic SVG renderer draws 6 emotion variants (idle, happy,
  hungry, pill-time, sad, sleeping) — instant, free, crisp at any size. Reacts
  ambient to the dose schedule.

## How to create your pet's agent

**You need two things: a coding agent ([Claude Code](https://claude.com/claude-code))
and a GitHub account.** Studio handles the rest — you don't write code, you have
a conversation.

**The guided path — [deco studio](https://studio.decocms.com):** connect your
GitHub, point Studio at this repo, and Studio runs the project like a coding
agent does — it has git, a shell, and Claude right there in the chat. It reads
[`AGENTS.md`](./AGENTS.md) and walks you through it: it asks a few questions
about your pet, forks and customizes the code for you, draws the pixel sprite,
and deploys to *your* own Cloudflare account. No terminal, no copy-pasting
commands — just answer questions and approve the deploy. Studio takes you the
whole way.

**On your own machine:** open your fork in Claude Code and run the
[`/create-agent`](./.claude/skills/create-agent.md) skill — the same `AGENTS.md`
flow, in your editor. Cursor, Aider, or doing it by hand from
[`AGENTS.md`](./AGENTS.md) all work too; every step is a real shell command.

## Architecture

- **Cloudflare Worker** (`api/main.cf.ts`) — MCP server, REST endpoints,
  cron-driven push notifications, static asset serving.
- **D1** (`api/db/schema.ts`) — singleton `pets` row + notes / prescriptions /
  doses / schedule_state / recordings / exams / metrics / vet_visits /
  vaccines / symptoms / vet_team. Accessed via Drizzle ORM.
- **R2** — uploaded files (the Assets library: exam PDFs, vaccine cards,
  audio chunks, per-pet sprite pack).
- **Cloudflare AI Gateway** — routes Anthropic (vision extraction, exam
  parsing, asset classification, character sheet) and Perplexity (vet
  research). No API keys live in the Worker; the gateway holds BYOK.
- **Workers AI** — Whisper transcription for audio recordings. (The companion
  sprite is procedural SVG — no image model, instant + free.)
- **React UI** (`web/`) — bundled to a single HTML by Vite. **Nine top-level
  apps** — Pet, Timeline, Timetable, Exams, Research, Recordings, Assets, Vet
  team, and Respiratory rate — each a pinnable MCP app (`app_*` tool → `ui://tama/*`
  resource → a hash route in the one bundle). Plus the ambient `/companion`
  and `/sprite-lab`, all served from the same Worker. When embedded in studio,
  studio's pinned-app bar is the navigation, so the in-app header is hidden;
  in a standalone browser tab the header provides the tab nav.

The repo is single-pet by design — there are no episodes; every record hangs
off the singleton `pet_self` and the **timeline** is a query-time merge across
the typed tables. No multi-tenant plumbing, no pet picker, no "which pet"
question to ever ask.

To explore with realistic data: `bun run seed:example` loads a synthetic
example pet ("Pixel", an anemia-recovery case). To pull template updates into
a fork: `bun run update` (see [docs/UPDATING.md](./docs/UPDATING.md)).

## Local development

After setting up the agent for your pet:

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

If you ran the pre-tama (episode-era) version on a Cloudflare account and
want to bring one pet's data forward into the new timeline shape:

```bash
# → local D1 by default, so you can test before touching prod
BETO_PET_ID=pet_xxxxx bun run scripts/migrate-beto.ts

# → a remote target instead
TARGET_REMOTE=1 TARGET_DB=tama-<petslug> TARGET_BUCKET=tama-<petslug>-files \
BETO_PET_ID=pet_xxxxx bun run scripts/migrate-beto.ts
```

It pulls each table from the source D1 as JSON, inserts only the columns that
exist in the new schema (so `episode_id` is dropped and everything re-keys onto
`pet_self`), mirrors the R2 blobs, and wipes the single-pet target first so it's
idempotent. See [`scripts/migrate-beto.ts`](./scripts/migrate-beto.ts).

To (re-)extract lab PDFs into charted metrics — e.g. a hemoglobin trend the old
deploy never captured — run the worker and feed the files through `exam_add`:

```bash
bun run dev   # worker on :8788, in another terminal
bun run scripts/ingest-exams.ts ~/Downloads/exam1.pdf ~/Downloads/exam2.pdf
```

## MCP tools

Every tool acts on **the** pet (no `petId` argument anywhere).

| Tool                        | What it does                                  |
| --------------------------- | --------------------------------------------- |
| `app_pet` / `app_timeline` / `app_timetable` / `app_exams` / `app_research` / `app_recordings` / `app_assets` / `app_vet_team` / `app_breathing` | The nine pinnable top-level apps |
| `pet_profile` / `pet_update`| Read / patch the singleton pet                |
| `pet_profile_refresh`       | AI rebuild of the structured case file ("pet sheet") from the timeline |
| `pet_profile_update`        | Manual surgical edit of the pet sheet (no AI) |
| `pet_sprite_svg_generate`   | 6-state procedural-SVG companion sprite from a photo (saves v1) |
| `pet_sprite_get` / `pet_sprite_adjust` | Read / iterate sprite traits (re-render, no new photo) |
| `timeline_get`              | The merged continuous timeline                |
| `timeline_note_add`         | Add a free-form timeline note                 |
| `vet_visit_add` / `_list`   | Log / read vet visits                         |
| `vaccine_add` / `_list`     | Log / read vaccinations                       |
| `symptom_add` / `_resolve` / `_list` | Log / resolve / read symptoms        |
| `vet_team_add` / `_list` / `_update` / `_remove` | The care team — vet/specialist roster (its own app) |
| `vet_team_extract` | AI: auto-fill the team from visits, recordings, and notes |
| `asset_upload` / `asset_list` | Drop any file → classified into the timeline |
| `prescription_upload` / `_create` / `_update` / `_list` / `_delete` | Prescriptions |
| `timetable_get`             | Derived live timetable for next N hours       |
| `dose_log` / `dose_update`  | Log given / skipped / undone                  |
| `schedule_state_list`       | Read live item state                          |
| `timetable_reschedule`      | Move the next dose (snooze / absolute time)   |
| `timetable_set_bounds`      | Treatment lifecycle: stop / extend / re-open / remove |
| `recording_*`               | Audio chunked upload → transcribe → apply (summarizes inline) |
| `exam_add`                  | Add a lab exam from a file or pasted text     |
| `exam_get` / `_list` / `_update` / `_delete` | Read one / list / edit / remove |
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

[See AGENTS.md](./AGENTS.md) for the setup lifecycle.
[See docs/](./docs/) for the open feature requests to the Studio team.
