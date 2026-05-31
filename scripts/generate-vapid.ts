// Generates a fresh VAPID keypair for web push. Run once per deploy; stash
// the output via `wrangler secret put VAPID_PRIVATE_KEY` / VAPID_PUBLIC_KEY /
// VAPID_SUBJECT.
//
// VAPID = Voluntary Application Server Identification — the keypair that
// identifies *your* worker to the user's push service when delivering a
// notification. The public key is also handed to the browser so it can
// scope its subscription to this server. Both keys are public-by-design
// to the eventual subscriber; the *private* key is only secret to the
// rest of the world.
//
// Output goes to stdout — copy/paste into wrangler secret put. No files
// are written, no secrets touch the disk.

import { subtle } from "node:crypto";

function base64urlEncode(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

async function main() {
	const { publicKey, privateKey } = await subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["sign", "verify"],
	);

	// VAPID public key: raw-uncompressed point (65 bytes, leading 0x04).
	const rawPub = await subtle.exportKey("raw", publicKey);
	const pubB64u = base64urlEncode(rawPub);

	// VAPID private key: the d component of a JWK, base64url-encoded scalar.
	const jwk = (await subtle.exportKey("jwk", privateKey)) as JsonWebKey;
	if (!jwk.d) throw new Error("Private key export missing d");
	const privB64u = jwk.d;

	console.log("# VAPID keypair — paste into wrangler secret put");
	console.log("# (or .dev.vars for local development)");
	console.log();
	console.log("VAPID_PUBLIC_KEY=", pubB64u);
	console.log("VAPID_PRIVATE_KEY=", privB64u);
	console.log("VAPID_SUBJECT=mailto:you@example.com  # change this");
	console.log();
	console.log("# Then expose VAPID_PUBLIC_KEY to the frontend via push_vapid_public_key tool.");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
