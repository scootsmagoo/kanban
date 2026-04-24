import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../index";
import {
  card,
  list,
  cardLabel,
  cardAssignee,
  checklist,
  checklistItem,
  comment,
  attachment,
  user,
} from "../db/schema";
import { newId, positionBetween } from "../lib/ids";
import { requireRole } from "../lib/permissions";
import { logActivity } from "../lib/activity";

const router = new Hono<AppContext>();

// ─── Create card ─────────────────────────────────────────────────────────
const createSchema = z.object({
  listId: z.string(),
  title: z.string().min(1).max(500),
  afterCardId: z.string().optional(),
});

router.post("/", zValidator("json", createSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const { listId, title, afterCardId } = c.req.valid("json");

  const [parentList] = await db.select().from(list).where(eq(list.id, listId)).limit(1);
  if (!parentList) return c.json({ error: "List not found" }, 404);
  await requireRole(db, parentList.boardId, me.id, "member");

  const cards = await db
    .select()
    .from(card)
    .where(and(eq(card.listId, listId), eq(card.archived, false)))
    .orderBy(asc(card.position));

  let beforePos: string | undefined;
  let afterPos: string | undefined;
  if (afterCardId) {
    const idx = cards.findIndex((cd) => cd.id === afterCardId);
    if (idx >= 0) {
      beforePos = cards[idx].position;
      afterPos = cards[idx + 1]?.position;
    }
  } else {
    beforePos = cards[cards.length - 1]?.position;
  }
  const position = positionBetween(beforePos, afterPos);

  const id = newId("crd");
  await db.insert(card).values({
    id,
    boardId: parentList.boardId,
    listId,
    title,
    position,
    createdBy: me.id,
  });

  await logActivity(db, {
    boardId: parentList.boardId,
    cardId: id,
    actorId: me.id,
    type: "card.created",
    data: { title, listId, listName: parentList.name },
  });

  const [created] = await db.select().from(card).where(eq(card.id, id)).limit(1);
  return c.json({ card: created }, 201);
});

// ─── Get card detail (with everything) ───────────────────────────────────
router.get("/:id", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");

  const [cd] = await db.select().from(card).where(eq(card.id, id)).limit(1);
  if (!cd) return c.json({ error: "Not found" }, 404);
  await requireRole(db, cd.boardId, me.id, "viewer");

  const labels = await db
    .select({ labelId: cardLabel.labelId })
    .from(cardLabel)
    .where(eq(cardLabel.cardId, id));

  const assignees = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(cardAssignee)
    .innerJoin(user, eq(user.id, cardAssignee.userId))
    .where(eq(cardAssignee.cardId, id));

  const checklists = await db
    .select()
    .from(checklist)
    .where(eq(checklist.cardId, id))
    .orderBy(asc(checklist.position));

  const checklistIds = checklists.map((cl) => cl.id);
  const allItems = checklistIds.length
    ? await db
        .select()
        .from(checklistItem)
        .where(inArray(checklistItem.checklistId, checklistIds))
        .orderBy(asc(checklistItem.position))
    : [];

  const comments = await db
    .select({
      id: comment.id,
      cardId: comment.cardId,
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      authorId: comment.authorId,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(comment)
    .innerJoin(user, eq(user.id, comment.authorId))
    .where(eq(comment.cardId, id))
    .orderBy(asc(comment.createdAt));

  const attachments = await db
    .select()
    .from(attachment)
    .where(eq(attachment.cardId, id));

  return c.json({
    card: cd,
    labelIds: labels.map((l) => l.labelId),
    assignees,
    checklists: checklists.map((cl) => ({
      ...cl,
      items: allItems.filter((it) => it.checklistId === cl.id),
    })),
    comments,
    attachments,
  });
});

// ─── Update card ─────────────────────────────────────────────────────────
const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  dueDate: z.union([z.number().int(), z.null()]).optional(),
  completedAt: z.union([z.number().int(), z.null()]).optional(),
  archived: z.boolean().optional(),
});

router.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const input = c.req.valid("json");

  const [existing] = await db.select().from(card).where(eq(card.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await requireRole(db, existing.boardId, me.id, "member");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.dueDate !== undefined)
    patch.dueDate = input.dueDate === null ? null : new Date(input.dueDate * 1000);
  if (input.completedAt !== undefined)
    patch.completedAt = input.completedAt === null ? null : new Date(input.completedAt * 1000);
  if (input.archived !== undefined) patch.archived = input.archived;

  await db.update(card).set(patch).where(eq(card.id, id));

  // Activity events for each meaningful change
  if (input.title && input.title !== existing.title) {
    await logActivity(db, {
      boardId: existing.boardId,
      cardId: id,
      actorId: me.id,
      type: "card.renamed",
      data: { from: existing.title, to: input.title },
    });
  }
  if (input.description !== undefined && input.description !== existing.description) {
    await logActivity(db, {
      boardId: existing.boardId,
      cardId: id,
      actorId: me.id,
      type: "card.described",
      data: { title: existing.title },
    });
  }
  if (input.dueDate !== undefined) {
    await logActivity(db, {
      boardId: existing.boardId,
      cardId: id,
      actorId: me.id,
      type: input.dueDate === null ? "card.due_cleared" : "card.due_set",
      data: { title: existing.title, dueDate: input.dueDate },
    });
  }
  if (input.completedAt !== undefined) {
    await logActivity(db, {
      boardId: existing.boardId,
      cardId: id,
      actorId: me.id,
      type: input.completedAt === null ? "card.uncompleted" : "card.completed",
      data: { title: existing.title },
    });
  }
  if (input.archived === true && !existing.archived) {
    await logActivity(db, {
      boardId: existing.boardId,
      cardId: id,
      actorId: me.id,
      type: "card.archived",
      data: { title: existing.title },
    });
  }

  const [updated] = await db.select().from(card).where(eq(card.id, id)).limit(1);
  return c.json({ card: updated });
});

// ─── Move card (drag/drop) ───────────────────────────────────────────────
const moveSchema = z.object({
  listId: z.string(),
  beforeCardId: z.string().optional(),
  afterCardId: z.string().optional(),
});

router.post("/:id/move", zValidator("json", moveSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const { listId, beforeCardId, afterCardId } = c.req.valid("json");

  const [existing] = await db.select().from(card).where(eq(card.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await requireRole(db, existing.boardId, me.id, "member");

  const [destList] = await db.select().from(list).where(eq(list.id, listId)).limit(1);
  if (!destList || destList.boardId !== existing.boardId) {
    return c.json({ error: "Cross-board moves not supported" }, 400);
  }

  const cards = await db
    .select()
    .from(card)
    .where(and(eq(card.listId, listId), eq(card.archived, false)))
    .orderBy(asc(card.position));

  const filtered = cards.filter((cd) => cd.id !== id);
  const before = beforeCardId ? filtered.find((cd) => cd.id === beforeCardId)?.position : undefined;
  const after = afterCardId ? filtered.find((cd) => cd.id === afterCardId)?.position : undefined;
  const position = positionBetween(before, after);

  await db
    .update(card)
    .set({ listId, position, updatedAt: new Date() })
    .where(eq(card.id, id));

  if (existing.listId !== listId) {
    const [fromList] = await db
      .select()
      .from(list)
      .where(eq(list.id, existing.listId))
      .limit(1);
    await logActivity(db, {
      boardId: existing.boardId,
      cardId: id,
      actorId: me.id,
      type: "card.moved",
      data: {
        title: existing.title,
        fromList: fromList?.name,
        toList: destList.name,
      },
    });
  }

  return c.json({ ok: true, listId, position });
});

router.delete("/:id", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db.select().from(card).where(eq(card.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await requireRole(db, existing.boardId, me.id, "member");

  await db.delete(card).where(eq(card.id, id));
  return c.json({ ok: true });
});

// ─── Assign / unassign members ───────────────────────────────────────────
router.post("/:id/assignees/:userId", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const userId = c.req.param("userId");

  const [existing] = await db.select().from(card).where(eq(card.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await requireRole(db, existing.boardId, me.id, "member");

  await db
    .insert(cardAssignee)
    .values({ cardId: id, userId })
    .onConflictDoNothing();

  await logActivity(db, {
    boardId: existing.boardId,
    cardId: id,
    actorId: me.id,
    type: "card.assigned",
    data: { title: existing.title, userId },
  });
  return c.json({ ok: true });
});

router.delete("/:id/assignees/:userId", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const userId = c.req.param("userId");

  const [existing] = await db.select().from(card).where(eq(card.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await requireRole(db, existing.boardId, me.id, "member");

  await db
    .delete(cardAssignee)
    .where(and(eq(cardAssignee.cardId, id), eq(cardAssignee.userId, userId)));

  await logActivity(db, {
    boardId: existing.boardId,
    cardId: id,
    actorId: me.id,
    type: "card.unassigned",
    data: { title: existing.title, userId },
  });
  return c.json({ ok: true });
});

// ─── Toggle a label on a card ────────────────────────────────────────────
router.post("/:id/labels/:labelId", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const labelId = c.req.param("labelId");

  const [existing] = await db.select().from(card).where(eq(card.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await requireRole(db, existing.boardId, me.id, "member");

  await db.insert(cardLabel).values({ cardId: id, labelId }).onConflictDoNothing();

  await logActivity(db, {
    boardId: existing.boardId,
    cardId: id,
    actorId: me.id,
    type: "card.labeled",
    data: { title: existing.title, labelId },
  });
  return c.json({ ok: true });
});

router.delete("/:id/labels/:labelId", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const labelId = c.req.param("labelId");

  const [existing] = await db.select().from(card).where(eq(card.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await requireRole(db, existing.boardId, me.id, "member");

  await db
    .delete(cardLabel)
    .where(and(eq(cardLabel.cardId, id), eq(cardLabel.labelId, labelId)));

  await logActivity(db, {
    boardId: existing.boardId,
    cardId: id,
    actorId: me.id,
    type: "card.unlabeled",
    data: { title: existing.title, labelId },
  });
  return c.json({ ok: true });
});

export default router;
