# Updating your Tama

Your Tama is a fork of [`decocms/tama`](https://github.com/decocms/tama). When
the upstream template gets new features or fixes, you can pull them in.

## One-time setup

Add the template as an `upstream` remote:

```bash
git remote add upstream https://github.com/decocms/tama.git
```

## Getting updates

```bash
git fetch upstream
git merge upstream/main
```

Your per-pet customizations live in isolated files that upstream rarely
touches, so merges are usually clean:

- `config/pet.json` — your pet's profile
- `wrangler.toml` — your worker name + D1/R2 binding ids
- your pet's sprite pack + data live in **D1/R2**, not in git

If git reports a conflict, it's almost always in one of those files — keep
**your** version (the pet is yours).

After merging, apply any new database migrations and redeploy:

```bash
bun install
bun run db:migrate:remote
bun run deploy
```

Or just run the helper, which does the fetch + merge and reminds you of the
deploy steps:

```bash
bun run update
```

## What won't be touched

Updates never reach into your Cloudflare account — your pet's medical history
(D1) and files (R2) are never part of a code merge. Worst case, a bad merge
only affects code you can `git reset`.
