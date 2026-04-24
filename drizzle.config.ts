import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./worker/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "d1-http",
  // For `drizzle-kit studio` against your remote D1 you'd add credentials here.
  // For local migrations we just generate SQL with `npm run db:generate`,
  // then apply via `wrangler d1 migrations apply`.
});
