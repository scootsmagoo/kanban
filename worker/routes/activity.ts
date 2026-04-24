import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import type { AppContext } from "../index";
import { activity, user } from "../db/schema";
import { requireRole } from "../lib/permissions";

const router = new Hono<AppContext>();

router.get("/board/:boardId", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const boardId = c.req.param("boardId");
  await requireRole(db, boardId, me.id, "viewer");

  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);

  const rows = await db
    .select({
      id: activity.id,
      boardId: activity.boardId,
      cardId: activity.cardId,
      type: activity.type,
      data: activity.data,
      createdAt: activity.createdAt,
      actorId: activity.actorId,
      actorName: user.name,
      actorImage: user.image,
    })
    .from(activity)
    .innerJoin(user, eq(user.id, activity.actorId))
    .where(eq(activity.boardId, boardId))
    .orderBy(desc(activity.createdAt))
    .limit(limit);

  return c.json({ activity: rows });
});

router.get("/card/:cardId", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const cardId = c.req.param("cardId");

  const rows = await db
    .select({
      id: activity.id,
      boardId: activity.boardId,
      cardId: activity.cardId,
      type: activity.type,
      data: activity.data,
      createdAt: activity.createdAt,
      actorId: activity.actorId,
      actorName: user.name,
      actorImage: user.image,
    })
    .from(activity)
    .innerJoin(user, eq(user.id, activity.actorId))
    .where(eq(activity.cardId, cardId))
    .orderBy(desc(activity.createdAt))
    .limit(100);

  if (rows.length > 0) {
    await requireRole(db, rows[0].boardId, me.id, "viewer");
  }
  return c.json({ activity: rows });
});

export default router;
