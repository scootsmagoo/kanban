import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { AppContext } from "../index";
import { label } from "../db/schema";
import { newId } from "../lib/ids";
import { requireRole } from "../lib/permissions";

const router = new Hono<AppContext>();

const createSchema = z.object({
  boardId: z.string(),
  name: z.string().max(120).default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

router.post("/", zValidator("json", createSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const input = c.req.valid("json");
  await requireRole(db, input.boardId, me.id, "member");

  const id = newId("lbl");
  await db.insert(label).values({
    id,
    boardId: input.boardId,
    name: input.name,
    color: input.color,
  });
  const [created] = await db.select().from(label).where(eq(label.id, id)).limit(1);
  return c.json({ label: created }, 201);
});

const updateSchema = z.object({
  name: z.string().max(120).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

router.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const [existing] = await db.select().from(label).where(eq(label.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await requireRole(db, existing.boardId, me.id, "member");

  await db.update(label).set(c.req.valid("json")).where(eq(label.id, id));
  const [updated] = await db.select().from(label).where(eq(label.id, id)).limit(1);
  return c.json({ label: updated });
});

router.delete("/:id", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const [existing] = await db.select().from(label).where(eq(label.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await requireRole(db, existing.boardId, me.id, "member");

  await db.delete(label).where(eq(label.id, id));
  return c.json({ ok: true });
});

export default router;
