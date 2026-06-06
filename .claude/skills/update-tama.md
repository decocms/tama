---
name: update-tama
description: Pull the latest Tama template changes from upstream into this fork, handling migrations and redeploy.
---

# Update this Tama from upstream

This repo is a fork of the Tama template (`decocms/tama`). Bring in upstream
improvements without clobbering this pet's customization.

## Steps

1. Ensure the upstream remote exists:
   ```bash
   git remote get-url upstream || git remote add upstream https://github.com/decocms/tama.git
   ```
2. Fetch + merge:
   ```bash
   git fetch upstream
   git merge upstream/main
   ```
3. If there are conflicts, they'll be in the per-pet files (`config/pet.json`,
   `wrangler.toml`). Keep the human's version — confirm with them which lines
   are theirs. Never overwrite their pet's name, ids, or bindings.
4. Apply new migrations + redeploy:
   ```bash
   bun install
   bun run db:migrate:remote
   bun run deploy
   ```
5. Tell the human what changed (summarize the merged commits) and confirm the
   deploy succeeded.

## Guardrails

- The pet's data (D1) and files (R2) are NOT in git — a merge can't touch them.
- Don't merge if the working tree is dirty; ask the human to commit/stash first.
- Migrations are append-only; `db:migrate:remote` is safe to re-run.
