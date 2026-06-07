import { withRuntime } from "@decocms/runtime";
import { type Env, StateSchema } from "./env.ts";
import { prompts } from "./prompts/index.ts";
import { uiResources } from "./resources/ui.ts";
import { getFile, readFileBytes } from "./storage/files.ts";
import { PET_SELF_ID } from "./storage/pet-self.ts";
import { upsertPushSubscription } from "./storage/push-subscriptions.ts";
import { tools } from "./tools/index.ts";

// biome-ignore lint/suspicious/noExplicitAny: runtime.fetch signature compatibility
type Fetcher = (req: Request, ...args: any[]) => Response | Promise<Response>;

const FILES_PATH_RE = /^\/api\/files\/([a-zA-Z0-9_-]+)$/;

// JSON helper for the small REST surface — keeps the responses uniform without
// pulling in another framework.
function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json",
			// Subscribe is invoked from the standalone /subscribe popup which is
			// the same origin, so CORS isn't strictly needed — but explicit no-cache
			// matters because some browsers cache POST responses unexpectedly.
			"cache-control": "no-store",
		},
	});
}

// Constant-time-ish string compare so a wrong token can't be probed byte by
// byte via timing. Length leak is acceptable for an opaque random token.
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

// Bearer-auth gate for the MCP endpoint. Returns a 401 Response when the
// request should be rejected, or null to let it through.
//   - Token UNSET (local dev / unconfigured fork): MCP stays open → null.
//   - Token SET: require `Authorization: Bearer <token>`. Studio sends this
//     via the connection's configured header; the standalone web UI sends a
//     token it has stored. Mismatch/missing → 401.
function mcpAuthRejection(req: Request, env: Env | undefined): Response | null {
	const expected = env?.MCP_BEARER_TOKEN?.trim();
	if (!expected) return null; // auth disabled
	const header = req.headers.get("authorization") ?? "";
	const m = /^Bearer\s+(.+)$/i.exec(header.trim());
	const presented = m?.[1]?.trim();
	if (presented && safeEqual(presented, expected)) return null;
	return new Response(
		JSON.stringify({
			jsonrpc: "2.0",
			id: null,
			error: { code: -32001, message: "Unauthorized: missing or invalid bearer token" },
		}),
		{
			status: 401,
			headers: {
				"content-type": "application/json",
				"www-authenticate": 'Bearer realm="tama-mcp"',
				"cache-control": "no-store",
			},
		},
	);
}

// Serve an uploaded file (prescription image, PDF, etc.) by fileId. Used by
// the UI to open the original document the AI extracted a prescription from.
async function serveFile(env: Env, fileId: string): Promise<Response> {
	const file = await getFile(env, fileId);
	if (!file) return new Response("Not found", { status: 404 });
	const bytes = await readFileBytes(env, file.r2Key);
	if (!bytes) return new Response("Not found", { status: 404 });
	return new Response(bytes, {
		headers: {
			"content-type": file.mimeType,
			"cache-control": "private, max-age=3600",
		},
	});
}

function withAssetsAndMcpRoutes(fetcher: Fetcher): Fetcher {
	return async (req: Request, ...args) => {
		const url = new URL(req.url);
		const env = args[0] as Env | undefined;

		// File downloads: /api/files/:fileId → R2 bytes with original mime type.
		const fileMatch = FILES_PATH_RE.exec(url.pathname);
		if (fileMatch && env) {
			return serveFile(env, fileMatch[1]);
		}

		// Plain REST for push setup — used by the standalone /subscribe page
		// (opened when the app is iframed inside deco studio, or when the user
		// installs the PWA to their iOS home screen). These mirror the
		// push_vapid_public_key and push_subscribe MCP tools but don't require
		// the MCP postMessage channel that only exists when embedded.
		if (env && url.pathname === "/api/push/vapid-public-key") {
			return jsonResponse({ publicKey: env.VAPID_PUBLIC_KEY ?? "" });
		}
		if (
			env &&
			url.pathname === "/api/push/subscribe" &&
			req.method === "POST"
		) {
			try {
				const body = (await req.json()) as {
					endpoint?: string;
					p256dh?: string;
					auth?: string;
					userAgent?: string | null;
				};
				if (!body.endpoint || !body.p256dh || !body.auth) {
					return jsonResponse(
						{ error: "endpoint, p256dh, and auth are required" },
						400,
					);
				}
				const row = await upsertPushSubscription(env, {
					endpoint: body.endpoint,
					p256dh: body.p256dh,
					auth: body.auth,
					petId: PET_SELF_ID,
					userAgent: body.userAgent ?? null,
				});
				return jsonResponse({ id: row.id, endpoint: row.endpoint });
			} catch (err) {
				return jsonResponse(
					{ error: err instanceof Error ? err.message : "Subscribe failed" },
					500,
				);
			}
		}

		// MCP API at /api/mcp → rewrite to /mcp for the runtime, gated by an
		// optional bearer token (see mcpAuthRejection).
		if (url.pathname === "/api/mcp" || url.pathname.startsWith("/api/mcp/")) {
			const rejected = mcpAuthRejection(req, env);
			if (rejected) return rejected;
			url.pathname = url.pathname.slice(4);
			const rewritten = new Request(url.toString(), req);
			return fetcher(rewritten, ...args);
		}

		// Don't expose unrewritten /mcp publicly
		if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
			return new Response("Not Found", { status: 404 });
		}

		// Static UI files come from the ASSETS binding (Workers static assets)
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
