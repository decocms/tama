# myvet

Veterinary care MCP for deco studio — pet profile, AI breed/condition research, illness episodes, prescription photo → live medicine + meal timetable.

Built for **Beto**, my dog, but works for any pet.

## What the MVP does

1. **Add animal** — name, breed, age, weight, notes.
2. **AI enrich profile** — Perplexity researches breed traits, age-appropriate care, and current conditions; saves findings + citations to the pet.
3. **Start an episode** — title + optional description; attach `chatlog` notes (pasted message history).
4. **Upload prescription photos** — Anthropic vision extracts each scheduled item, tagging it as `medication` or `meal` (e.g. PAPA on the whiteboard → meal).
5. **Live timetable** — derived from confirmed prescriptions; "Give now" / "Skip" logs a dose; doses given early/late shift the next dose to preserve the interval. Editable from UI and chat.

## Architecture

- **Cloudflare Worker** (`api/main.cf.ts`) serves the MCP at `/api/mcp` and the UI at all other paths via the Workers Assets binding.
- **D1** for structured data (`api/db/schema.ts`), accessed via Drizzle ORM.
- **R2** for prescription image blobs.
- **Cloudflare AI Gateway** routes both Anthropic (vision extraction) and Perplexity (breed research) — no API keys live in the Worker, only the gateway URL.
- **React UI** (`web/`) bundled to a single HTML file by Vite, dispatched per tool via the `TOOL_PAGES` map in `web/router.tsx`.

## One-time setup

1. **Cloudflare AI Gateway**: in the dashboard, create a gateway named `myvet`. Under *Settings → Authentication / Providers*, add your Anthropic and Perplexity API keys (BYOK). Note your account id.

2. **Fill in `wrangler.toml`**:
   ```toml
   [vars]
   AI_GATEWAY_ACCOUNT_ID = "<your-cf-account-id>"
   AI_GATEWAY_NAME       = "myvet"
   ```

3. **Create D1 + R2**:
   ```bash
   bun install
   bunx wrangler d1 create myvet
   # paste the returned database_id into wrangler.toml
   bunx wrangler r2 bucket create myvet-files
   bunx wrangler r2 bucket create myvet-files-dev
   ```

4. **Apply migrations locally**:
   ```bash
   bun run db:migrate:local
   ```

## Run locally

```bash
bun run dev
```

This runs `vite build --watch` (rebuilds `dist/client/index.html` on changes) alongside `wrangler dev` (serves the Worker at `http://localhost:8787`). Miniflare emulates D1 + R2 with persistence by default.

## Connect from deco studio

In studio, create an HTTP connection pointing at:

```
http://localhost:8787/api/mcp
```

Add the connection to a Virtual MCP / agent. All 12 tools become available. Use the `myvet_care_guide` prompt for a guided flow.

## Deploy

```bash
bunx wrangler d1 migrations apply myvet --remote
bun run deploy
```

Update the studio connection URL to your `*.workers.dev` address.

## Tools

| Tool                  | What it does                                                  |
| --------------------- | ------------------------------------------------------------- |
| `pet_create`          | Add a pet                                                     |
| `pet_enrich`          | Perplexity research → enrichmentJson                          |
| `pet_get` / `pet_list`| Read                                                          |
| `episode_start`       | Start a care episode                                          |
| `episode_get`         | Dashboard: timetable + Rx + notes                             |
| `episode_list`        | List episodes                                                 |
| `episode_end`         | Close an episode                                              |
| `episode_add_note`    | Add text or chatlog note                                      |
| `prescription_upload` | Vision-extract a photo → draft prescription                   |
| `prescription_update` | Edit / confirm a prescription                                 |
| `prescription_list`   | List prescriptions for an episode                             |
| `timetable_get`       | Derived live timetable                                        |
| `dose_log`            | Log dose given / skipped, with optional adjustment            |
| `timetable_adjust`    | Shift the next dose of an item by N hours                     |

## Data layout

D1 tables: `pets`, `episodes`, `notes`, `files`, `prescriptions`, `doses`.
R2 keys: `prescriptions/<fileId>.<ext>`. Originals are immutable — re-uploading "the same" image creates a new file row + R2 key.

## Tests

```bash
bun test          # unit tests for timetable derivation
bun run check     # tsc --noEmit
bun run ci:check  # biome
```

## Roadmap (not in MVP)

- Vaccine calendar
- Exam OCR + history
- Appointment recorder
- Reminders / push notifications
- Multi-user / auth
