import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../index";
import { list, card } from "../db/schema";
import { newId, positionBetween } from "../lib/ids";
import { requireRole } from "../lib/permissions";
import { logActivity } from "../lib/activity";

const router = new Hono<AppContext>();

const createSchema = z.object({
  boardId: z.string(),
  name: z.string().min(1).max(120),
  afterListId: z.string().optional(),
});

router.post("/", zValidator("json", createSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const { boardId, name, afterListId } = c.req.valid("json");
  await requireRole(db, boardId, me.id, "member");

  // Compute position
  const lists = await db
    .select()
    .from(list)
    .where(and(eq(list.boardId, boardId), eq(list.archived, false)))
    .orderBy(asc(list.position));

  let beforePos: string | undefined;
  let afterPos: string | undefined;
  if (afterListId) {
    const idx = lists.findIndex((l) => l.id === afterListId);
    if (idx >= 0) {
      beforePos = lists[idx].position;
      afterPos = lists[idx + 1]?.position;
    }
  } else {
    beforePos = lists[lists.length - 1]?.position;
  }
  const position = positionBetween(beforePos, afterPos);

  const id = newId("lst");
  await db.insert(list).values({ id, boardId, name, position });

  await logActivity(db, {
    boardId,
    actorId: me.id,
    type: "list.created",
    data: { listId: id, name },
  });

  const [created] = await db.select().from(list).where(eq(list.id, id)).limit(1);
  return c.json({ list: created }, 201);
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  archived: z.boolean().optional(),
});

router.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const input = c.req.valid("json");

  const [existing] = await db.select().from(list).where(eq(list.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await requireRole(db, existing.boardId, me.id, "member");

  await db
    .update(list)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(list.id, id));

  if (input.name && input.name !== existing.name) {
    await logActivity(db, {
      boardId: existing.boardId,
      actorId: me.id,
      type: "list.renamed",
      data: { listId: id, from: existing.name, to: input.name },
    });
  }
  if (input.archived === true && !existing.archived) {
    await logActivity(db, {
      boardId: existing.boardId,
      actorId: me.id,
      type: "list.archived",
      data: { listId: id, name: existing.name },
    });
  }

  const [updated] = await db.select().from(list).where(eq(list.id, id)).limit(1);
  return c.json({ list: updated });
});

const moveSchema = z.object({
  beforeListId: z.string().optional(),
  afterListId: z.string().optional(),
});

router.post("/:id/move", zValidator("json", moveSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const { beforeListId, afterListId } = c.req.valid("json");

  const [existing] = await db.select().from(list).where(eq(list.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await requireRole(db, existing.boardId, me.id, "member");

  const lists = await db
    .select()
    .from(list)
    .where(and(eq(list.boardId, existing.boardId), eq(list.archived, false)))
    .orderBy(asc(list.position));
  const before = beforeListId ? lists.find((l) => l.id === beforeListId)?.position : undefined;
  const after = afterListId ? lists.find((l) => l.id === afterListId)?.position : undefined;
  const position = positionBetween(before, after);

  await db.update(list).set({ position, updatedAt: new Date() }).where(eq(list.id, id));

  await logActivity(db, {
    boardId: existing.boardId,
    actorId: me.id,
    type: "list.moved",
    data: { listId: id, name: existing.name },
  });

  return c.json({ ok: true, position });
});

router.delete("/:id", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db.select().from(list).where(eq(list.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await requireRole(db, existing.boardId, me.id, "admin");

  await db.delete(card).where(eq(card.listId, id));
  await db.delete(list).where(eq(list.id, id));
  return c.json({ ok: true });
});

export default router;
