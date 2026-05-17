import { createHashHistory } from "@tanstack/history";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { EpisodePage } from "./pages/Episode.tsx";
import { HomePage } from "./pages/Home.tsx";
import { PetPage } from "./pages/Pet.tsx";

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

const episode = createRoute({
	getParentRoute: () => rootRoute,
	path: "/episode/$episodeId",
	component: EpisodePage,
});

const routeTree = rootRoute.addChildren([home, pet, episode]);

const router = createRouter({
	routeTree,
	history: createHashHistory(),
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

export function MainApp() {
	return (
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	);
}
