import type { App } from "@modelcontextprotocol/ext-apps/react";

export async function callTool<TOut = unknown>(
	app: App | null,
	name: string,
	args: Record<string, unknown> = {},
): Promise<TOut> {
	if (!app) throw new Error("Not connected to host");
	const result = await app.callServerTool({ name, arguments: args });
	if (result.isError) {
		const text =
			result.content?.find((c) => c.type === "text")?.text ?? "Tool error";
		throw new Error(text);
	}
	if (result.structuredContent === undefined) {
		throw new Error(`Tool ${name} returned no structured content`);
	}
	return result.structuredContent as TOut;
}
