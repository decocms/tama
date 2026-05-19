// MyVet service worker — push reminders only.
//
// Vite's singlefile build inlines the SPA into index.html, but files under
// public/ are copied to dist/client/ verbatim, so this file is served at
// /sw.js — exactly where the registration in web/main/lib/push.ts expects it.
//
// Scope is the site origin (we register from /). No offline caching: this
// is a thin push listener, not a full PWA cache layer.

const CACHE_NONE = true; // marker for intent — keep this SW lean

self.addEventListener("install", () => {
	// Take over as soon as the new SW finishes installing — there's nothing
	// to migrate (no caches) so this is safe.
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		try {
			data = { title: "MyVet", body: event.data ? event.data.text() : "" };
		} catch {
			data = { title: "MyVet", body: "" };
		}
	}
	const title = data.title || "MyVet reminder";
	const options = {
		body: data.body || "",
		icon: "/icons/icon-192.png",
		badge: "/icons/icon-192.png",
		// `tag` collapses duplicate notifications for the same dose if the
		// service retries delivery. We still want the device to alert again
		// for a new dose, so each tag is unique per (scheduleStateId, plannedAt).
		tag: data.tag || "myvet",
		data: {
			url: data.url || "/",
			scheduleStateId: data.scheduleStateId,
			plannedAt: data.plannedAt,
		},
		// Keep the alert visible until the user acts — reminders shouldn't
		// auto-dismiss while the pet is waiting on their dose.
		requireInteraction: true,
	};
	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const targetUrl =
		(event.notification.data && event.notification.data.url) || "/";
	event.waitUntil(
		(async () => {
			const allClients = await self.clients.matchAll({
				type: "window",
				includeUncontrolled: true,
			});
			// Reuse an already-open MyVet tab if there is one — saves a cold
			// load and preserves any in-flight state (recording, drafts).
			for (const client of allClients) {
				const u = new URL(client.url);
				if (u.origin === self.location.origin) {
					await client.focus();
					// Navigate via postMessage so the hash router updates in-place
					// without a full reload.
					client.postMessage({
						type: "navigate",
						url: targetUrl,
					});
					return;
				}
			}
			await self.clients.openWindow(targetUrl);
		})(),
	);
});
