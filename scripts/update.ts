#!/usr/bin/env bun
// `bun run update` — pull the latest Tama template changes into this fork.
// Adds the upstream remote if missing, fetches, merges, and prints the
// post-merge deploy steps. Aborts on a dirty working tree.

import { $ } from "bun";

const UPSTREAM = "https://github.com/decocms/tama.git";

async function main() {
	const status = (await $`git status --porcelain`.text()).trim();
	if (status) {
		console.error(
			"Working tree is dirty — commit or stash your changes first, then re-run.",
		);
		process.exit(1);
	}

	const remotes = await $`git remote`.text();
	if (!remotes.split("\n").includes("upstream")) {
		console.log("Adding upstream remote…");
		await $`git remote add upstream ${UPSTREAM}`;
	}

	console.log("Fetching upstream…");
	await $`git fetch upstream`;
	console.log("Merging upstream/main…");
	await $`git merge upstream/main`;

	console.log(`
✓ Merged. Now apply migrations + redeploy:

    bun install
    bun run db:migrate:remote
    bun run deploy

(Your pet's data in D1/R2 is untouched — this was only a code update.)`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
