# Tama — template

This repo is a **template**. It is not configured for any specific pet yet.

If you are reading this as a coding-agent (Studio's coding-agent, Claude Code,
Cursor, Aider, anything that follows the AGENTS.md convention) and the human
who imported this repo has not yet completed the customize step, your job is
to walk them through the **customize → commit → deploy → operate** lifecycle
described below. There is no `bun run adopt` script — you (the agent) make
the edits yourself using your normal file/edit tools.

**Do not modify code beyond what these steps require.** This file is the only
load-bearing front door for setup, and also carries the architecture notes for
ongoing development (see the end). Note: [CLAUDE.md](./CLAUDE.md) is **not** a
dev guide — it's the **deployed agent's system prompt** (the pet's personality
and medical grounding that Studio loads); you customize it in step 1.

---

## What this repo is

A single-pet care agent on Cloudflare Workers + D1 + R2. The deployed worker
exposes:

- `/` — the Pet app (profile, health summary, companion, Assets library).
  Plus `/timeline` (continuous life log) and `/timetable` (medicine schedule).
- `/companion` — an ambient pixel-companion view, intended as a PWA `start_url`.
- `/mcp` — the MCP server endpoint Studio imports to get chat-driven admin.
- Cron-driven push notifications for medication reminders.

The thesis: **one agent, one pet, one deploy.** No multi-tenant complexity,
no pet picker, no "which pet" question to ever ask. Each fork is *somebody's*
pet.

**The human only needs a coding agent (Claude Code) and a GitHub account.**
Inside **deco studio** this whole file runs in one chat: Studio gives you (the
agent) git + a shell scoped to the project — like Claude Code's bash tool — so
you can fork, edit, commit, and trigger the deploy without the human ever
leaving the conversation. Drive it end-to-end; only pause for the inputs and
approvals the steps below call out.

---

## Lifecycle

### 1. CUSTOMIZE

Start a conversation with the human. Don't put up a form — ask one or two
questions at a time, like a person would. Collect:

- **Name** — what the pet is called.
- **Species** — usually "dog" or "cat", but anything works.
- **Breed** — free text. Best guess from the photo is fine.
- **DOB** — actual birthdate or "about 6 years old" (we store as text).
- **Weight (kg)** — optional but improves dosing context.
- **Timezone** — confirm the human's IANA tz (e.g. `America/Sao_Paulo`); it's
  what `prescription HH:mm` times are interpreted in.
- **Photo** — used for the pixel sprite. Ask them to paste one.
- **Owner notes / known conditions** — optional, but improves AI research.

**Edits to make:**

1. Update `config/pet.json` (create it if it doesn't exist) with all the
   above. This is the static, in-repo profile that ships in commits.
2. Replace placeholder strings in:
   - `public/manifest.webmanifest` — `name`, `short_name`.
   - `package.json` — `name` and `description`.
   - `wrangler.toml` — `name` (a slug for the deployed worker URL).
   - Any "Tama" in `README.md`, page `<title>` tags, dashboard copy.
   - `api/db/migrations/0011_singleton_pet.sql` — the seed row's `name` so
     fresh deploys land with the right pet identity from minute one.
   - `CLAUDE.md` — the **agent's system prompt**. Replace the `<placeholders>`
     with the pet's real identity, active medical context, meds, diet, and
     red-flag signs. This is what makes the deployed agent *know* the pet.
   - `app.json` — set `name`/`friendlyName`/`description` and point
     `connection.url` at the deployed worker's `/api/mcp`.
3. Generate the sprite pack: call `pet_sprite_svg_generate` (this repo's MCP
   tool) with `imageBase64` of the photo and `mimeType`. One Claude vision
   call reads the photo into a character sheet, then 6 SVG states render
   instantly. The tool stores the pack on the pet row automatically.
4. If the human gave owner notes or breed, also call `pet_enrich` so the
   dashboard ships with a baseline of AI research.

### 2. COMMIT

```bash
git add -A
git commit -m "Create <Petname>'s agent"
```

Encourage the human to push to their own GitHub fork so the work has a durable
home and future agents can pick up where you left off.

### 3. DEPLOY

The human's Cloudflare account needs:

- A D1 database — `wrangler d1 create tama-<petslug>` → patch `database_id`
  and `database_name` in `wrangler.toml`.
- An R2 bucket — `wrangler r2 bucket create tama-<petslug>-files` → patch
  `bucket_name` in `wrangler.toml`.
- VAPID keys for web push — generate with `bun run scripts/generate-vapid.ts`
  (the one pure utility script that survived the rebrand). Stash with
  `wrangler secret put VAPID_PRIVATE_KEY` and `... VAPID_PUBLIC_KEY` and
  `... VAPID_SUBJECT`.
- Anthropic key for Claude (used for prescription/exam extraction and the
  character sheet for the sprite). `wrangler secret put ANTHROPIC_API_KEY`.
- Cloudflare AI Gateway — already configured in `wrangler.toml`'s vars,
  but the human may want their own gateway slug.

Then:

```bash
bun install
bun run db:migrate:remote
bun run deploy
```

The output prints the deployed URL (`https://tama-<petslug>.<acct>.workers.dev`).
Walk the human through:

- Opening the URL.
- Adding `/companion` to their home screen (iOS Safari: Share → Add to Home
  Screen; macOS Chrome: address bar install icon).
- Granting notification permission so dose reminders fire.

### 4. OPERATE

Once deployed, the worker is itself an MCP server at `<deployed-url>/mcp`.
In Studio (or any MCP client), import that endpoint. The same chat is now
the agent's admin panel — the human can talk to the pet, log doses, upload
exams, ask vet research questions, all from one surface.

After this step, `AGENTS.md` is done. Future work uses `CLAUDE.md` for
guidance on day-to-day development.

---

## What you should not do

- **Don't refactor.** This template is opinionated; respect the shape.
- **Don't add multi-pet support.** That's the deliberate non-goal — see the
  Tama plan doc if you need the rationale.
- **Don't skip the sprite generation.** It's slow but it's the soul of the
  companion view; the static placeholder is intentionally a placeholder.
- **Don't commit secrets.** Cloudflare secrets go through `wrangler secret
  put`, not `.dev.vars` (which is gitignored anyway, but the human should
  use `wrangler secret put` for prod).

---

## Architecture & ongoing development

The Worker is three things at once: a single-page React app, an MCP server at
`/api/mcp` (rewritten to `/mcp` internally), and a cron that fires medication
push reminders. One deploy **is** one pet — every record hangs off the
singleton `pet_self` (no `petId` arguments anywhere).

### The seven apps

Each top-level surface is its own **pinnable MCP app**, wired uniformly:

`app_<x>` tool (`api/tools/app-surfaces.ts`) → `_meta.ui.resourceUri`
(`ui://tama/<x>`, `api/tools/uris.ts`) → an HTML resource that serves the one
bundle (`api/resources/ui.ts`) → a hash route (`web/main/App.tsx`), mapped from
the opening tool in `web/app.tsx` (`TOOL_TO_ROUTE`).

| App | Route | Tool |
| --- | --- | --- |
| Pet | `/` | `app_pet` |
| Timeline | `/timeline` | `app_timeline` |
| Timetable | `/timetable` | `app_timetable` |
| Exams | `/exams` | `app_exams` |
| Research | `/research` | `app_research` |
| Recordings | `/recordings` | `app_recordings` |
| Respiratory rate | `/breathing` | `app_breathing` |

Non-app routes: `/companion` (ambient PWA `start_url`), `/sprite-lab`,
`/subscribe`, `/exams/detail`.

**To add an app:** add a `URI` entry; an `app_*` tool registered in
`api/tools/index.ts`; an `htmlResource` in `api/resources/ui.ts`; a route in
`web/main/App.tsx`; a `TOOL_TO_ROUTE` entry in `web/app.tsx`; and a `NAV` row in
`web/main/components/Layout.tsx` for the standalone browser nav.

### Embedded vs standalone chrome

Inside studio (iframe), studio's pinned-app bar is the navigation, so `Layout`
hides its own header (`isInIframe()`); a standalone browser tab shows the header
tabs. Tool calls match: embedded → studio's MCP channel (`web/main/lib/mcp.ts`),
standalone → direct `POST /api/mcp` (carrying the bearer token when set).

### MCP bearer auth

`/api/mcp` is gated by `mcpAuthRejection` in `api/app.ts`: requires
`Authorization: Bearer <MCP_BEARER_TOKEN>` only when that secret is set; unset
(local dev / fresh fork) leaves it open.

### Data

D1 + Drizzle (`api/db/schema.ts`), append-only migrations
(`api/db/migrations`). The **timeline** is a query-time merge across typed
tables — no generic events table, no episodes. R2 holds uploaded files. The
sprite pack and structured "pet sheet" are JSON columns on the pet row.

### Commands

```bash
bun run dev               # vite build --watch + wrangler dev (localhost:8788)
bun run check             # tsc --noEmit
bun test                  # unit tests
bun run build             # single-file bundle → dist/client
bun run deploy            # build + wrangler deploy (default wrangler.toml)
bun run db:migrate:local  # apply migrations to local D1
```

Per-deploy config lives in its own `wrangler.<name>.toml`; deploy with
`wrangler deploy -c wrangler.<name>.toml`.
