import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./api/db/schema.ts",
	out: "./api/db/migrations",
	dialect: "sqlite",
});
