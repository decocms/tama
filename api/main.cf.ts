import { app } from "./app.ts";
import type { Bindings } from "./env.ts";

export default {
	fetch: (req: Request, env: Bindings, ctx: ExecutionContext) =>
		app.fetch(req, env, ctx),
};
