// Web Push client glue: service worker registration + PushManager wiring.
//
// Everything here is browser-only — it talks to the existing MCP tools
// (push_vapid_public_key, push_subscribe, push_unsubscribe) for server I/O.

import type { App } from "@modelcontextprotocol/ext-apps/react";
import { callTool } from "./mcp.ts";

const SW_URL = "/sw.js";

// VAPID public keys are base64url-encoded; PushManager.subscribe() wants
// raw bytes as a Uint8Array via the applicationServerKey option.
function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
	const padding = "=".repeat((4 - (b64.length % 4)) % 4);
	const padded = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(padded);
	const out = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

function bytesToBase64Url(buf: ArrayBuffer | null): string {
	if (!buf) return "";
	const bytes = new Uint8Array(buf);
	let s = "";
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isPushSupported(): boolean {
	return (
		typeof window !== "undefined" &&
		"serviceWorker" in navigator &&
		"PushManager" in window &&
		"Notification" in window
	);
}

// iOS only delivers Web Push when the app is installed to the home screen
// (display-mode: standalone). We detect this so the UI can prompt the user
// to install instead of failing silently on PushManager.subscribe().
export function isIOS(): boolean {
	if (typeof navigator === "undefined") return false;
	const ua = navigator.userAgent;
	// iPadOS 13+ reports itself as Mac in UA — disambiguate via touch points.
	const looksLikeMac =
		/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
	return /iPhone|iPad|iPod/.test(ua) || looksLikeMac;
}

export function isStandalone(): boolean {
	if (typeof window === "undefined") return false;
	// `navigator.standalone` is the iOS-Safari-specific flag; the media query
	// covers Chrome/Android/desktop installs.
	const iosStandalone =
		(navigator as unknown as { standalone?: boolean }).standalone === true;
	const mqStandalone = window.matchMedia("(display-mode: standalone)").matches;
	return iosStandalone || mqStandalone;
}

// On iOS, Web Push is exposed ONLY to Safari proper. iOS Chrome / Firefox /
// Edge / in-app browsers all wrap WebKit and surface Notification/PushManager
// in the global namespace, but `requestPermission()` silently returns
// "denied" — there's no user-visible prompt. So `isPushSupported()` would lie
// here; we need a tighter check to route those users to "open in Safari".
//
// Safari's iOS UA contains "Safari/<n>" and NONE of the third-party tokens
// {CriOS, FxiOS, EdgiOS, OPiOS, GSA}. In-app WKWebViews (Facebook, Instagram,
// Chrome's custom tabs, etc.) usually lack "Safari/" entirely.
export function isIOSSafari(): boolean {
	if (!isIOS()) return false;
	if (typeof navigator === "undefined") return false;
	const ua = navigator.userAgent;
	if (/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line\//.test(ua))
		return false;
	if (!/Safari\//.test(ua)) return false;
	return true;
}

// Detect whether we're loaded as a cross-origin iframe (e.g. inside deco
// studio). Cross-origin iframes can't reliably show notification permission
// prompts (Chrome blocks without permissions-policy, Safari blocks outright)
// and can't be installed as PWAs — both of which break the push flow. When
// this returns true, RemindersToggle hands off to the standalone /subscribe
// page in a popup.
export function isInIframe(): boolean {
	if (typeof window === "undefined") return false;
	try {
		return window.self !== window.top;
	} catch {
		// Cross-origin access throws — that itself confirms we're iframed.
		return true;
	}
}

export function notificationPermission(): NotificationPermission {
	if (typeof Notification === "undefined") return "denied";
	return Notification.permission;
}

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
	if (!isPushSupported()) {
		return Promise.reject(new Error("Push not supported in this browser"));
	}
	if (!registrationPromise) {
		registrationPromise = navigator.serviceWorker
			.register(SW_URL, { scope: "/" })
			.then(async (reg) => {
				// Wait for an active worker — needed before PushManager.subscribe().
				if (reg.active) return reg;
				await new Promise<void>((resolve) => {
					const installing = reg.installing || reg.waiting;
					if (!installing) return resolve();
					installing.addEventListener("statechange", () => {
						if (installing.state === "activated") resolve();
					});
				});
				return reg;
			});
	}
	return registrationPromise;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
	if (!isPushSupported()) return null;
	const reg = await registerServiceWorker();
	return reg.pushManager.getSubscription();
}

function subscriptionPayload(sub: PushSubscription, petId?: string) {
	const p256dh = sub.getKey("p256dh");
	const auth = sub.getKey("auth");
	if (!p256dh || !auth) {
		throw new Error(
			"Subscription is missing key material — browser returned a partial PushSubscription",
		);
	}
	return {
		endpoint: sub.endpoint,
		p256dh: bytesToBase64Url(p256dh),
		auth: bytesToBase64Url(auth),
		userAgent: navigator.userAgent,
		petId: petId ?? null,
	};
}

export interface SubscribeArgs {
	app: App | null;
	petId?: string;
}

export async function subscribeToPush({
	app,
	petId,
}: SubscribeArgs): Promise<PushSubscription> {
	if (!isPushSupported()) {
		throw new Error("Push notifications aren't supported in this browser");
	}
	if (isIOS() && !isStandalone()) {
		throw new Error(
			"On iPhone/iPad, install Tama to your Home Screen first (Share → Add to Home Screen), then open it from there.",
		);
	}
	const perm = await Notification.requestPermission();
	if (perm !== "granted") {
		throw new Error(
			perm === "denied"
				? "Notifications are blocked. Enable them in your browser's site settings, then try again."
				: "Notification permission was not granted.",
		);
	}
	const { publicKey } = await callTool<{ publicKey: string }>(
		app,
		"push_vapid_public_key",
	);
	const reg = await registerServiceWorker();
	let sub = await reg.pushManager.getSubscription();
	if (!sub) {
		sub = await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(publicKey),
		});
	}
	await callTool(app, "push_subscribe", subscriptionPayload(sub, petId));
	return sub;
}

// Standalone subscribe — same flow as subscribeToPush, but talks to the
// /api/push/* REST endpoints instead of MCP tools. Used by the /subscribe
// page which loads outside the deco studio iframe and therefore has no
// MCP postMessage channel.
export async function subscribeStandalone({
	petId,
}: {
	petId?: string;
} = {}): Promise<PushSubscription> {
	if (!isPushSupported()) {
		throw new Error("Push notifications aren't supported in this browser");
	}
	if (isIOS() && !isStandalone()) {
		throw new Error(
			"On iPhone/iPad, install Tama to your Home Screen first (Share → Add to Home Screen), then open it from there.",
		);
	}
	const perm = await Notification.requestPermission();
	if (perm !== "granted") {
		throw new Error(
			perm === "denied"
				? "Notifications are blocked. Enable them in your browser's site settings, then try again."
				: "Notification permission was not granted.",
		);
	}
	const keyRes = await fetch("/api/push/vapid-public-key");
	if (!keyRes.ok) {
		throw new Error(`Couldn't fetch VAPID key (${keyRes.status})`);
	}
	const { publicKey } = (await keyRes.json()) as { publicKey: string };
	if (!publicKey) throw new Error("Server has no VAPID public key configured");
	const reg = await registerServiceWorker();
	let sub = await reg.pushManager.getSubscription();
	if (!sub) {
		sub = await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(publicKey),
		});
	}
	const res = await fetch("/api/push/subscribe", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(subscriptionPayload(sub, petId)),
	});
	if (!res.ok) {
		throw new Error(`Server rejected subscription (${res.status})`);
	}
	return sub;
}

export async function unsubscribeFromPush(app: App | null): Promise<boolean> {
	const sub = await getExistingSubscription();
	if (!sub) return false;
	const endpoint = sub.endpoint;
	const ok = await sub.unsubscribe();
	if (ok) {
		try {
			await callTool(app, "push_unsubscribe", { endpoint });
		} catch (err) {
			console.warn("push_unsubscribe server call failed", err);
		}
	}
	return ok;
}
