import { createHashHistory } from "@tanstack/history";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { useEffect } from "react";
import {
	isInIframe,
	isPushSupported,
	isStandalone,
	registerServiceWorker,
} from "./lib/push.ts";
import { EpisodePage } from "./pages/Episode.tsx";
import { ExamsPage } from "./pages/Exams.tsx";
import { ExamsDetailPage } from "./pages/ExamsDetail.tsx";
import { HomePage } from "./pages/Home.tsx";
import { PetPage } from "./pages/Pet.tsx";
import { SubscribePage } from "./pages/Subscribe.tsx";

const queryClient = new QueryClient({
	defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const home = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: HomePage,
});

const pet = createRoute({
	getParentRoute: () => rootRoute,
	path: "/pet/$petId",
	component: PetPage,
});

const exams = createRoute({
	getParentRoute: () => rootRoute,
	path: "/pet/$petId/exams",
	component: ExamsPage,
});

const examsDetail = createRoute({
	getParentRoute: () => rootRoute,
	path: "/pet/$petId/exams/detail",
	component: ExamsDetailPage,
	validateSearch: (search: Record<string, unknown>) => ({
		keys: typeof search.keys === "string" ? search.keys : undefined,
	}),
});

const episode = createRoute({
	getParentRoute: () => rootRoute,
	path: "/episode/$episodeId",
	component: EpisodePage,
});

// Standalone push-setup surface. Reached two ways:
//   1. A button in the in-studio RemindersToggle opens this page in a new tab
//      (because iframed contexts can't reliably prompt for notifications).
//   2. iOS users who Add-to-Home-Screen and launch from there land at "/" —
//      the redirect below in `usePushBootstrap` bounces them here.
const subscribe = createRoute({
	getParentRoute: () => rootRoute,
	path: "/subscribe",
	component: SubscribePage,
});

const routeTree = rootRoute.addChildren([
	home,
	pet,
	exams,
	examsDetail,
	episode,
	subscribe,
]);

const router = createRouter({
	routeTree,
	history: createHashHistory(),
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const STUDIO_URL = "https://studio.decocms.com";

function usePushBootstrap() {
	useEffect(() => {
		// Standalone launch (e.g. iOS PWA opened from home screen, or a desktop
		// install) lands here at /. The day-to-day surface is deco studio —
		// bounce them either to /subscribe (so they can finish setup or see
		// "all set") or directly to studio. Iframed loads stay put.
		if (!isInIframe() && isStandalone()) {
			const onSubscribe = window.location.hash.startsWith("#/subscribe");
			if (!onSubscribe) {
				window.location.hash = "#/subscribe";
			}
		}

		if (!isPushSupported()) return;
		// Register the service worker on first mount so the user doesn't have to
		// wait when they tap "Enable reminders". Failure is non-fatal — the
		// toggle will surface the real error if they try to subscribe.
		registerServiceWorker().catch((err) => {
			console.warn("Service worker registration failed", err);
		});
		// The SW dispatches { type: "navigate", url } when a notification is
		// clicked while the app is already open. Hash router → just set the
		// hash and the router picks it up. If we're loaded standalone (the iOS
		// home-screen PWA), redirect to studio for the deep-linked URL so the
		// user lands in the real workspace.
		const onMessage = (ev: MessageEvent) => {
			const data = ev.data as { type?: string; url?: string } | undefined;
			if (data?.type !== "navigate" || !data.url) return;
			if (!isInIframe() && isStandalone()) {
				// We're in the PWA shell — open studio in a new tab/window so the
				// PWA stays focused on its own surface and studio gets a clean tab.
				window.open(STUDIO_URL, "_blank");
				return;
			}
			const hashIndex = data.url.indexOf("#");
			if (hashIndex >= 0) {
				window.location.hash = data.url.slice(hashIndex + 1);
			} else {
				window.location.href = data.url;
			}
		};
		navigator.serviceWorker.addEventListener("message", onMessage);
		return () =>
			navigator.serviceWorker.removeEventListener("message", onMessage);
	}, []);
}

export function MainApp() {
	usePushBootstrap();
	return (
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	);
}
