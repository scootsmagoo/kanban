import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../index";
import { card, checklist, checklistItem } from "../db/schema";
import { newId, positionBetween } from "../lib/ids";
import { requireRole } from "../lib/permissions";
import { logActivity } from "../lib/activity";

const router = new Hono<AppContext>();

// ─── Create checklist on a card ──────────────────────────────────────────
const createChecklistSchema = z.object({
  cardId: z.string(),
  title: z.string().min(1).max(120).default("Checklist"),
});

router.post("/", zValidator("json", createChecklistSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const { cardId, title } = c.req.valid("json");

  const [cd] = await db.select().from(card).where(eq(card.id, cardId)).limit(1);
  if (!cd) return c.json({ error: "Card not found" }, 404);
  await requireRole(db, cd.boardId, me.id, "member");

  const existing = await db
    .select()
    .from(checklist)
    .where(eq(checklist.cardId, cardId))
    .orderBy(asc(checklist.position));
  const position = positionBetween(existing[existing.length - 1]?.position, undefined);

  const id = newId("chk");
  await db.insert(checklist).values({ id, cardId, title, position });

  await logActivity(db, {
    boardId: cd.boardId,
    cardId,
    actorId: me.id,
    type: "checklist.added",
    data: { title, cardTitle: cd.title },
  });

  const [created] = await db.select().from(checklist).where(eq(checklist.id, id)).limit(1);
  return c.json({ checklist: { ...created, items: [] } }, 201);
});

// ─── Rename / delete checklist ───────────────────────────────────────────
router.patch(
  "/:id",
  zValidator("json", z.object({ title: z.string().min(1).max(120) })),
  async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const id = c.req.param("id");
    const [existing] = await db.select().from(checklist).where(eq(checklist.id, id)).limit(1);
    if (!existing) return c.json({ error: "Not found" }, 404);
    const [cd] = await db.select().from(card).where(eq(card.id, existing.cardId)).limit(1);
    if (!cd) return c.json({ error: "Card not found" }, 404);
    await requireRole(db, cd.boardId, me.id, "member");
    await db.update(checklist).set({ title: c.req.valid("json").title }).where(eq(checklist.id, id));
    return c.json({ ok: true });
  },
);

router.delete("/:id", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const [existing] = await db.select().from(checklist).where(eq(checklist.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  const [cd] = await db.select().from(card).where(eq(card.id, existing.cardId)).limit(1);
  if (!cd) return c.json({ error: "Card not found" }, 404);
  await requireRole(db, cd.boardId, me.id, "member");
  await db.delete(checklist).where(eq(checklist.id, id));
  return c.json({ ok: true });
});

// ─── Add item to checklist ───────────────────────────────────────────────
const addItemSchema = z.object({
  checklistId: z.string(),
  text: z.string().min(1).max(500),
});

router.post("/items", zValidator("json", addItemSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const { checklistId, text } = c.req.valid("json");

  const [parent] = await db.select().from(checklist).where(eq(checklist.id, checklistId)).limit(1);
  if (!parent) return c.json({ error: "Checklist not found" }, 404);
  const [cd] = await db.select().from(card).where(eq(card.id, parent.cardId)).limit(1);
  if (!cd) return c.json({ error: "Card not found" }, 404);
  await requireRole(db, cd.boardId, me.id, "member");

  const items = await db
    .select()
    .from(checklistItem)
    .where(eq(checklistItem.checklistId, checklistId))
    .orderBy(asc(checklistItem.position));
  const position = positionBetween(items[items.length - 1]?.position, undefined);

  const id = newId("itm");
  await db.insert(checklistItem).values({ id, checklistId, text, position });
  const [created] = await db.select().from(checklistItem).where(eq(checklistItem.id, id)).limit(1);
  return c.json({ item: created }, 201);
});

// ─── Update checklist item (text or completed) ───────────────────────────
const updateItemSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  completed: z.boolean().optional(),
});

router.patch("/items/:id", zValidator("json", updateItemSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db.select().from(checklistItem).where(eq(checklistItem.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  const [parent] = await db
    .select()
    .from(checklist)
    .where(eq(checklist.id, existing.checklistId))
    .limit(1);
  if (!parent) return c.json({ error: "Checklist gone" }, 404);
  const [cd] = await db.select().from(card).where(eq(card.id, parent.cardId)).limit(1);
  if (!cd) return c.json({ error: "Card gone" }, 404);
  await requireRole(db, cd.boardId, me.id, "member");

  const input = c.req.valid("json");
  await db.update(checklistItem).set(input).where(eq(checklistItem.id, id));

  if (input.completed !== undefined && input.completed !== existing.completed) {
    await logActivity(db, {
      boardId: cd.boardId,
      cardId: cd.id,
      actorId: me.id,
      type: "checklist.item.toggled",
      data: { cardTitle: cd.title, item: existing.text, completed: input.completed },
    });
  }
  return c.json({ ok: true });
});

router.delete("/items/:id", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const [existing] = await db.select().from(checklistItem).where(eq(checklistItem.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  const [parent] = await db
    .select()
    .from(checklist)
    .where(eq(checklist.id, existing.checklistId))
    .limit(1);
  if (!parent) return c.json({ error: "Checklist gone" }, 404);
  const [cd] = await db.select().from(card).where(eq(card.id, parent.cardId)).limit(1);
  if (!cd) return c.json({ error: "Card gone" }, 404);
  await requireRole(db, cd.boardId, me.id, "member");
  await db.delete(checklistItem).where(eq(checklistItem.id, id));
  return c.json({ ok: true });
});

// silence unused var
void and;

export default router;
