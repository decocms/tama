import { withRuntime } from "@decocms/runtime";
import { type Env, StateSchema } from "./env.ts";
import { prompts } from "./prompts/index.ts";
import { uiResources } from "./resources/ui.ts";
import { tools } from "./tools/index.ts";

// biome-ignore lint/suspicious/noExplicitAny: runtime.fetch signature compatibility
type Fetcher = (req: Request, ...args: any[]) => Response | Promise<Response>;

function withAssetsAndMcpRoutes(fetcher: Fetcher): Fetcher {
	return async (req: Request, ...args) => {
		const url = new URL(req.url);

		// MCP API at /api/mcp → rewrite to /mcp for the runtime
		if (url.pathname === "/api/mcp" || url.pathname.startsWith("/api/mcp/")) {
			url.pathname = url.pathname.slice(4);
			const rewritten = new Request(url.toString(), req);
			return fetcher(rewritten, ...args);
		}

		// Don't expose unrewritten /mcp publicly
		if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
			return new Response("Not Found", { status: 404 });
		}

		// Static UI files come from the ASSETS binding (Workers static assets)
		const env = args[0] as Env | undefined;
		if (env?.ASSETS) {
			try {
				return await env.ASSETS.fetch(req);
			} catch {
				// fall through to runtime
			}
		}

		return fetcher(req, ...args);
	};
}

const runtime = withRuntime<Env, typeof StateSchema>({
	configuration: { state: StateSchema },
	tools,
	prompts,
	resources: uiResources,
});

export const app = {
	fetch: withAssetsAndMcpRoutes(runtime.fetch),
};
