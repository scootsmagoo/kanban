import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { AppContext } from "../index";
import { card, comment } from "../db/schema";
import { newId } from "../lib/ids";
import { requireRole } from "../lib/permissions";
import { logActivity } from "../lib/activity";

const router = new Hono<AppContext>();

const createSchema = z.object({
  cardId: z.string(),
  body: z.string().min(1).max(20000),
});

router.post("/", zValidator("json", createSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const { cardId, body } = c.req.valid("json");
  const [cd] = await db.select().from(card).where(eq(card.id, cardId)).limit(1);
  if (!cd) return c.json({ error: "Not found" }, 404);
  await requireRole(db, cd.boardId, me.id, "member");

  const id = newId("cmt");
  await db.insert(comment).values({ id, cardId, authorId: me.id, body });

  await logActivity(db, {
    boardId: cd.boardId,
    cardId,
    actorId: me.id,
    type: "comment.added",
    data: { cardTitle: cd.title, preview: body.slice(0, 120) },
  });

  return c.json({ ok: true, id }, 201);
});

router.patch(
  "/:id",
  zValidator("json", z.object({ body: z.string().min(1).max(20000) })),
  async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const id = c.req.param("id");
    const [existing] = await db.select().from(comment).where(eq(comment.id, id)).limit(1);
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.authorId !== me.id) return c.json({ error: "Forbidden" }, 403);
    await db
      .update(comment)
      .set({ body: c.req.valid("json").body, updatedAt: new Date() })
      .where(eq(comment.id, id));
    return c.json({ ok: true });
  },
);

router.delete("/:id", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const [existing] = await db.select().from(comment).where(eq(comment.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  const [cd] = await db.select().from(card).where(eq(card.id, existing.cardId)).limit(1);
  if (!cd) return c.json({ error: "Card gone" }, 404);

  // Author or board admin can delete
  if (existing.authorId !== me.id) {
    await requireRole(db, cd.boardId, me.id, "admin");
  } else {
    await requireRole(db, cd.boardId, me.id, "member");
  }
  await db.delete(comment).where(eq(comment.id, id));

  await logActivity(db, {
    boardId: cd.boardId,
    cardId: cd.id,
    actorId: me.id,
    type: "comment.deleted",
    data: { cardTitle: cd.title },
  });
  return c.json({ ok: true });
});

export default router;
