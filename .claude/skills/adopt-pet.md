---
name: adopt-pet
description: Customize the Tama template for a specific pet — conversation, edits, sprite generation, optional deploy.
---

# Adopt this Tama for a pet

You're customizing a fresh fork of the Tama template (a single-pet care
agent on Cloudflare Workers). This is the same lifecycle described in
`/AGENTS.md`, but as a Claude Code skill — `/adopt-pet` is a one-tap way
into it.

## Conversation, not a form

Ask one or two questions at a time, like a person would. Mirror the
human's tone. Collect:

1. **Name** of the pet.
2. **Species** + **breed** (best guess from the photo is fine).
3. **DOB** — actual birthdate or rough age description.
4. **Weight** in kg.
5. **Timezone** — confirm IANA tz; if unsure, run `date +%Z` or ask
   their city and infer.
6. **Photo** — get them to drag-and-drop or paste one. Required for the
   sprite step.
7. **Owner notes** — known conditions, allergies, behavior quirks.

If the photo is huge, that's fine — `pet_sprite_generate` handles
arbitrary inputs.

## Edits to make

Using your normal file/edit tools:

1. Create or update `config/pet.json` with everything you collected.
2. Search-and-replace placeholder strings:
   - `public/manifest.webmanifest`: `name` and `short_name`
   - `package.json`: `name` and `description`
   - `wrangler.toml`: worker `name` (slug-friendly: lowercase, hyphens)
   - `README.md`, page `<title>` tags, hero copy
   - `api/db/migrations/0011_singleton_pet.sql`: the seed row's `name`
3. Call the `pet_sprite_generate` MCP tool with the photo. This takes
   30–60s; let the human know. Don't move on until it returns. The tool
   writes the sprite pack to R2 and updates the pet row.
4. Call `pet_enrich` to seed AI research from the breed + conditions.

## Commit

```bash
git add -A
git commit -m "Adopt Tama for <Petname>"
```

Suggest they push to their own GitHub fork.

## Deploy (optional in this skill)

If the human wants to deploy now, walk them through:

```bash
wrangler d1 create tama-<petslug>
wrangler r2 bucket create tama-<petslug>-files
# patch wrangler.toml with the new IDs

bun run scripts/generate-vapid.ts
wrangler secret put VAPID_PRIVATE_KEY  # paste the private key
wrangler secret put VAPID_PUBLIC_KEY   # paste the public key
wrangler secret put VAPID_SUBJECT      # mailto:owner@email
wrangler secret put ANTHROPIC_API_KEY

bun install
bun run db:migrate:remote
bun run deploy
```

Then show them how to add `/companion` to their home screen as a PWA.

## What not to do

- Don't refactor unrelated code.
- Don't add multi-pet support — it's a deliberate non-goal.
- Don't skip `pet_sprite_generate` — the static placeholder is meant
  to be replaced.
- Don't commit secrets — only `wrangler secret put` is acceptable for
  production keys.
