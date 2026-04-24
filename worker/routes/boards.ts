import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../index";
import { board, boardMember, list, card, label } from "../db/schema";
import { newId } from "../lib/ids";
import { logActivity } from "../lib/activity";
import { requireRole } from "../lib/permissions";

const router = new Hono<AppContext>();

// ─── List my boards ──────────────────────────────────────────────────────
router.get("/", async (c) => {
  const db = c.get("db");
  const me = c.get("user");

  const memberships = await db
    .select({ boardId: boardMember.boardId, role: boardMember.role })
    .from(boardMember)
    .where(eq(boardMember.userId, me.id));

  if (memberships.length === 0) return c.json({ boards: [] });

  const boards = await db
    .select()
    .from(board)
    .where(
      and(
        inArray(
          board.id,
          memberships.map((m) => m.boardId),
        ),
        eq(board.archived, false),
      ),
    )
    .orderBy(desc(board.updatedAt));

  const roleByBoard = new Map(memberships.map((m) => [m.boardId, m.role]));
  return c.json({
    boards: boards.map((b) => ({ ...b, role: roleByBoard.get(b.id) ?? "viewer" })),
  });
});

// ─── Create a board ──────────────────────────────────────────────────────
const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

router.post("/", zValidator("json", createSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const input = c.req.valid("json");

  const id = newId("brd");
  const now = new Date();

  await db.insert(board).values({
    id,
    name: input.name,
    description: input.description ?? null,
    color: input.color ?? "#0ea5e9",
    ownerId: me.id,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(boardMember).values({
    boardId: id,
    userId: me.id,
    role: "owner",
    createdAt: now,
  });

  // Seed default lists, Trello-style.
  const defaultLists = [
    { name: "To Do", position: "G" },
    { name: "Doing", position: "U" },
    { name: "Done", position: "g" },
  ];
  for (const l of defaultLists) {
    await db.insert(list).values({
      id: newId("lst"),
      boardId: id,
      name: l.name,
      position: l.position,
    });
  }

  // Seed Trello's classic label colors (no names).
  const palette = [
    "#22c55e", // green
    "#eab308", // yellow
    "#f97316", // orange
    "#ef4444", // red
    "#a855f7", // purple
    "#3b82f6", // blue
    "#06b6d4", // cyan
    "#ec4899", // pink
  ];
  for (const color of palette) {
    await db.insert(label).values({
      id: newId("lbl"),
      boardId: id,
      name: "",
      color,
    });
  }

  await logActivity(db, {
    boardId: id,
    actorId: me.id,
    type: "board.created",
    data: { name: input.name },
  });

  const created = (await db.select().from(board).where(eq(board.id, id))).at(0);
  return c.json({ board: { ...created, role: "owner" as const } }, 201);
});

// ─── Get one board (with full payload for board view) ────────────────────
router.get("/:id", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");

  const role = await requireRole(db, id, me.id, "viewer");

  const [b] = await db.select().from(board).where(eq(board.id, id)).limit(1);
  if (!b) return c.json({ error: "Not found" }, 404);

  const lists = await db
    .select()
    .from(list)
    .where(and(eq(list.boardId, id), eq(list.archived, false)))
    .orderBy(list.position);

  const cards = await db
    .select()
    .from(card)
    .where(and(eq(card.boardId, id), eq(card.archived, false)))
    .orderBy(card.position);

  const labels = await db.select().from(label).where(eq(label.boardId, id));

  return c.json({ board: { ...b, role }, lists, cards, labels });
});

// ─── Update board ────────────────────────────────────────────────────────
const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  archived: z.boolean().optional(),
});

router.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  await requireRole(db, id, me.id, "admin");

  const input = c.req.valid("json");
  await db
    .update(board)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(board.id, id));

  await logActivity(db, {
    boardId: id,
    actorId: me.id,
    type: "board.updated",
    data: input,
  });

  const [updated] = await db.select().from(board).where(eq(board.id, id)).limit(1);
  return c.json({ board: updated });
});

// ─── Delete board ────────────────────────────────────────────────────────
router.delete("/:id", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  await requireRole(db, id, me.id, "owner");

  await db.delete(board).where(eq(board.id, id));
  return c.json({ ok: true });
});

export default router;
