import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./env";
import { createAuth } from "./auth";
import { getDb, type DB } from "./db/client";
import boardsRouter from "./routes/boards";
import listsRouter from "./routes/lists";
import cardsRouter from "./routes/cards";
import labelsRouter from "./routes/labels";
import checklistsRouter from "./routes/checklists";
import commentsRouter from "./routes/comments";
import attachmentsRouter from "./routes/attachments";
import membersRouter from "./routes/members";
import activityRouter from "./routes/activity";
import searchRouter from "./routes/search";

export type AppContext = {
  Bindings: Env;
  Variables: {
    db: DB;
    user: { id: string; email: string; name: string };
    session: { id: string; userId: string };
  };
};

const app = new Hono<AppContext>();

app.use("*", logger());
app.use("*", cors({ origin: (o) => o, credentials: true }));

// ─── Better Auth handler (mounted before our DB middleware) ───────────────
app.on(["GET", "POST"], "/api/auth/*", async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// ─── DB + auth middleware for everything else ─────────────────────────────
app.use("/api/*", async (c, next) => {
  c.set("db", getDb(c.env.DB));

  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  c.set("session", { id: session.session.id, userId: session.user.id });
  await next();
});

// ─── Current user ─────────────────────────────────────────────────────────
app.get("/api/me", (c) => c.json({ user: c.get("user") }));

// ─── Routers ──────────────────────────────────────────────────────────────
app.route("/api/boards", boardsRouter);
app.route("/api/lists", listsRouter);
app.route("/api/cards", cardsRouter);
app.route("/api/labels", labelsRouter);
app.route("/api/checklists", checklistsRouter);
app.route("/api/comments", commentsRouter);
app.route("/api/attachments", attachmentsRouter);
app.route("/api/members", membersRouter);
app.route("/api/activity", activityRouter);
app.route("/api/search", searchRouter);

// ─── Error handler ────────────────────────────────────────────────────────
app.onError((err, c) => {
  const status = (err as { status?: number }).status ?? 500;
  console.error("[api error]", err);
  return c.json({ error: err.message ?? "Internal error" }, status as 400);
});

// ─── Catch-all: hand off to static assets (SPA) ───────────────────────────
app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
