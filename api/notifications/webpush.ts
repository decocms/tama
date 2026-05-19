// Web Push (VAPID) sender for Cloudflare Workers.
//
// Pure Web Crypto — no Node deps, no npm package. Implements:
//   • VAPID JWT signing (ES256 / P-256, RFC 8292)
//   • aes128gcm payload encryption (RFC 8188 + RFC 8291)
//
// Reference: https://datatracker.ietf.org/doc/html/rfc8291
//
// The `web-push` npm package does the same thing on Node; here we use the
// platform crypto directly so the bundle has zero runtime dependencies.

import type { Env } from "../env.ts";
import {
	deletePushSubscriptionByEndpoint,
	type PushSubscription,
} from "../storage/push-subscriptions.ts";

// --- base64url helpers --------------------------------------------------

// Bytes type alias: an ArrayBuffer-backed Uint8Array. TS 5+ added a generic
// parameter so the default `Uint8Array` is `Uint8Array<ArrayBufferLike>`,
// which is NOT assignable to BufferSource (= ArrayBufferView<ArrayBuffer>).
// Using this alias keeps everything narrow without scattering casts.
type Bytes = Uint8Array<ArrayBuffer>;

function b64urlDecode(s: string): Bytes {
	let padded = s.replace(/-/g, "+").replace(/_/g, "/");
	while (padded.length % 4) padded += "=";
	const bin = atob(padded);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
	const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	let s = "";
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...parts: Uint8Array[]): Bytes {
	let total = 0;
	for (const p of parts) total += p.length;
	const out = new Uint8Array(total);
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out;
}

// --- VAPID JWT (RFC 8292) -----------------------------------------------

function originFromEndpoint(endpoint: string): string {
	const u = new URL(endpoint);
	return `${u.protocol}//${u.host}`;
}

// Build an ECDSA P-256 private key from the VAPID private (d) + public (x,y)
// scalars produced by `npx web-push generate-vapid-keys`. Public is the
// uncompressed point (0x04 || X || Y, 65 bytes); private is just `d` (32 B).
async function importVapidKeyPair(
	privateB64: string,
	publicB64: string,
): Promise<{ privateKey: CryptoKey; publicRaw: Bytes }> {
	const d = b64urlDecode(privateB64);
	const pubBytes = b64urlDecode(publicB64);
	if (d.length !== 32) {
		throw new Error(
			`VAPID private key must be 32 bytes (got ${d.length}); expected base64url of the raw P-256 scalar`,
		);
	}
	if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
		throw new Error(
			"VAPID public key must be 65 bytes starting with 0x04 (uncompressed P-256)",
		);
	}
	const jwk: JsonWebKey = {
		kty: "EC",
		crv: "P-256",
		x: b64urlEncode(pubBytes.slice(1, 33)),
		y: b64urlEncode(pubBytes.slice(33, 65)),
		d: b64urlEncode(d),
		ext: true,
		key_ops: ["sign"],
	};
	const privateKey = await crypto.subtle.importKey(
		"jwk",
		jwk,
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["sign"],
	);
	return { privateKey, publicRaw: pubBytes };
}

async function signVapidJwt(
	env: Env,
	endpoint: string,
): Promise<{ jwt: string; pubB64: string }> {
	const pub = env.VAPID_PUBLIC_KEY;
	const priv = env.VAPID_PRIVATE_KEY;
	if (!pub || !priv) {
		throw new Error(
			"VAPID keys not configured — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (wrangler secret put / .dev.vars)",
		);
	}
	const { privateKey, publicRaw } = await importVapidKeyPair(priv, pub);
	const headerB = b64urlEncode(
		new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })),
	);
	const payloadB = b64urlEncode(
		new TextEncoder().encode(
			JSON.stringify({
				aud: originFromEndpoint(endpoint),
				// Spec allows up to 24h; 12h gives plenty of buffer.
				exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
				sub: env.VAPID_SUBJECT ?? "mailto:admin@example.com",
			}),
		),
	);
	const signingInput = new TextEncoder().encode(`${headerB}.${payloadB}`);
	// SubtleCrypto ECDSA sign returns r||s (P1363/JWS) directly.
	const sig = await crypto.subtle.sign(
		{ name: "ECDSA", hash: "SHA-256" },
		privateKey,
		signingInput,
	);
	return {
		jwt: `${headerB}.${payloadB}.${b64urlEncode(sig)}`,
		pubB64: b64urlEncode(publicRaw),
	};
}

// --- aes128gcm payload encryption (RFC 8188 + RFC 8291) -----------------

async function hkdfDerive(
	salt: Bytes,
	ikm: Bytes,
	info: Bytes,
	length: number,
): Promise<Bytes> {
	const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
		"deriveBits",
	]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "HKDF", hash: "SHA-256", salt, info },
		baseKey,
		length * 8,
	);
	return new Uint8Array(bits);
}

async function encryptPayload(
	payload: Bytes,
	sub: PushSubscription,
): Promise<Bytes> {
	// 1. Ephemeral ECDH P-256 key pair ("AS" / application-server key).
	const ephem = (await crypto.subtle.generateKey(
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		["deriveBits"],
	)) as CryptoKeyPair;
	const asPubRaw: Bytes = new Uint8Array(
		await crypto.subtle.exportKey("raw", ephem.publicKey),
	);
	// 2. Subscriber ("UA") public key, raw uncompressed.
	const uaPubRaw = b64urlDecode(sub.p256dh);
	const uaPub = await crypto.subtle.importKey(
		"raw",
		uaPubRaw,
		{ name: "ECDH", namedCurve: "P-256" },
		false,
		[],
	);
	// 3. ECDH shared secret (32 bytes for P-256).
	const sharedBits = await crypto.subtle.deriveBits(
		{ name: "ECDH", public: uaPub },
		ephem.privateKey,
		256,
	);
	const shared: Bytes = new Uint8Array(sharedBits);
	// 4. IKM = HKDF(authSecret, shared, "WebPush: info\0" || uaPub || asPub, 32)
	const authSecret = b64urlDecode(sub.auth);
	const keyInfo = concatBytes(
		new TextEncoder().encode("WebPush: info\0"),
		uaPubRaw,
		asPubRaw,
	);
	const ikm = await hkdfDerive(authSecret, shared, keyInfo, 32);
	// 5. CEK + nonce derivation per RFC 8188 (aes128gcm content-encoding).
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const cekBytes = await hkdfDerive(
		salt,
		ikm,
		new TextEncoder().encode("Content-Encoding: aes128gcm\0"),
		16,
	);
	const nonce = await hkdfDerive(
		salt,
		ikm,
		new TextEncoder().encode("Content-Encoding: nonce\0"),
		12,
	);
	const cek = await crypto.subtle.importKey(
		"raw",
		cekBytes,
		{ name: "AES-GCM" },
		false,
		["encrypt"],
	);
	// 6. Plaintext padding: single record → append 0x02 delimiter.
	const plaintext: Bytes = concatBytes(payload, new Uint8Array([0x02]));
	const encrypted: Bytes = new Uint8Array(
		await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cek, plaintext),
	);
	// 7. Assemble: salt(16) || rs(4 BE) || idlen(1) || keyid(asPub) || record
	const rs = 4096;
	const header: Bytes = new Uint8Array(16 + 4 + 1 + asPubRaw.length);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, rs, false);
	header[20] = asPubRaw.length; // 65 for uncompressed P-256
	header.set(asPubRaw, 21);
	return concatBytes(header, encrypted);
}

// --- public API ---------------------------------------------------------

export interface SendResult {
	ok: boolean;
	status: number;
	removed?: boolean;
	error?: string;
}

export interface PushPayload {
	title: string;
	body: string;
	url?: string;
	tag?: string;
	scheduleStateId?: string;
	plannedAt?: string;
}

export async function sendPush(
	env: Env,
	sub: PushSubscription,
	payload: PushPayload,
	opts?: {
		ttlSeconds?: number;
		urgency?: "very-low" | "low" | "normal" | "high";
	},
): Promise<SendResult> {
	try {
		const plaintext: Bytes = new Uint8Array(
			new TextEncoder().encode(JSON.stringify(payload)),
		);
		const body = await encryptPayload(plaintext, sub);
		const { jwt, pubB64 } = await signVapidJwt(env, sub.endpoint);
		const res = await fetch(sub.endpoint, {
			method: "POST",
			headers: {
				"content-type": "application/octet-stream",
				"content-encoding": "aes128gcm",
				ttl: String(opts?.ttlSeconds ?? 4 * 60 * 60), // 4h — reminders go stale fast
				urgency: opts?.urgency ?? "high",
				authorization: `vapid t=${jwt}, k=${pubB64}`,
			},
			// TextEncoder/typed-array narrowing differs between Workers and
			// browser libdom — Cloudflare's fetch accepts the Uint8Array fine
			// at runtime, but the cast satisfies the BodyInit type union.
			body: body as BodyInit,
		});
		// 404 = endpoint never existed; 410 = unsubscribed. Both mean "drop it".
		if (res.status === 404 || res.status === 410) {
			await deletePushSubscriptionByEndpoint(env, sub.endpoint);
			return { ok: false, status: res.status, removed: true };
		}
		return { ok: res.ok, status: res.status };
	} catch (err) {
		return {
			ok: false,
			status: 0,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
