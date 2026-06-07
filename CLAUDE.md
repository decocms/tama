# CLAUDE.md — day-to-day development

`AGENTS.md` covers the one-time **customize → deploy** lifecycle for a fresh
fork. This file is for ongoing work once a pet is live.

## Mental model

One deploy **is** one pet. Every record hangs off the singleton `pet_self`
(no `petId` arguments anywhere). The Worker is three things at once:

- a **web app** (single-page React bundle, hash router),
- an **MCP server** at `/api/mcp` (rewritten to `/mcp` internally),
- a **cron** that fires medication push reminders.

## The seven apps

Each top-level surface is its own **pinnable MCP app**. The wiring is uniform:

`app_<x>` tool (`api/tools/app-surfaces.ts`) → `_meta.ui.resourceUri`
(`ui://tama/<x>`, `api/tools/uris.ts`) → an HTML resource that serves the one
bundle (`api/resources/ui.ts`) → a hash route the bundle renders
(`web/main/App.tsx`), mapped from the opening tool in `web/app.tsx`
(`TOOL_TO_ROUTE`).

| App | Route | Tool |
| --- | --- | --- |
| Pet (profile, sheet, companion, assets) | `/` | `app_pet` |
| Timeline (continuous life log) | `/timeline` | `app_timeline` |
| Timetable (live med/meal schedule) | `/timetable` | `app_timetable` |
| Exams (charts + AI explain) | `/exams` | `app_exams` |
| Research (vet-research history + ask) | `/research` | `app_research` |
| Recordings (vet-visit audio + transcripts) | `/recordings` | `app_recordings` |
| Respiratory rate (camera BPM) | `/breathing` | `app_breathing` |

Non-app routes: `/companion` (ambient PWA `start_url`), `/sprite-lab`,
`/subscribe` (push setup), `/exams/detail`.

**To add an app:** add a `URI` entry, an `app_*` tool + register it in
`api/tools/index.ts`, an `htmlResource` in `api/resources/ui.ts`, a route in
`web/main/App.tsx`, a `TOOL_TO_ROUTE` entry in `web/app.tsx`, and (for the
standalone browser nav) a row in `NAV` in `web/main/components/Layout.tsx`.

## Embedded vs standalone chrome

When the bundle runs **inside studio** (iframe), studio's pinned-app bar is the
navigation, so `Layout` hides its own header (`isInIframe()`). In a **standalone
browser tab** there's no studio chrome, so `Layout` renders the header with the
tab nav. Tool calls follow the same split: embedded → studio's MCP channel
(`web/main/lib/mcp.ts` via `app.callServerTool`), standalone → direct
`POST /api/mcp` (which also carries the bearer token, below).

## MCP bearer auth

`/api/mcp` is gated by `mcpAuthRejection` in `api/app.ts`. It requires
`Authorization: Bearer <MCP_BEARER_TOKEN>` **only when that secret is set** —
unset (local dev, fresh forks) leaves the MCP open. Studio sends the token via
the connection's header; the standalone web app reads it from `localStorage`,
bootstrapped once from a `?token=…` URL param.

## Data

D1 + Drizzle (`api/db/schema.ts`), append-only migrations in
`api/db/migrations`. The **timeline** is a query-time merge across typed tables
(notes, doses, exams, recordings, vet_visits, vaccines, symptoms) — there is no
generic events table and no episodes. R2 holds uploaded files. The pet's SVG
sprite pack and structured "pet sheet" live as JSON columns on the pet row.

## Commands

```bash
bun run dev               # vite build --watch + wrangler dev (localhost:8788)
bun run check             # tsc --noEmit
bun test                  # unit tests
bun run build             # vite single-file bundle → dist/client
bun run deploy            # build + wrangler deploy (default wrangler.toml)
bun run db:migrate:local  # apply migrations to local D1
```

Per-deploy config lives in its own `wrangler.<name>.toml`; deploy a specific
one with `wrangler deploy -c wrangler.<name>.toml`.

## Don'ts

- No multi-pet support, no pet picker — single-pet is the deliberate shape.
- No `petId` arguments — everything is implicitly `pet_self`.
- Don't commit secrets — use `wrangler secret put`.
