import { Hono } from "hono";
import { and, eq, inArray, like, or } from "drizzle-orm";
import type { AppContext } from "../index";
import { board, boardMember, card, list } from "../db/schema";

const router = new Hono<AppContext>();

router.get("/", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const q = (c.req.query("q") ?? "").trim();
  if (!q) return c.json({ boards: [], cards: [] });

  const like1 = `%${q}%`;

  // Boards I'm a member of
  const myBoards = await db
    .select({ boardId: boardMember.boardId })
    .from(boardMember)
    .where(eq(boardMember.userId, me.id));
  const boardIds = myBoards.map((m) => m.boardId);
  if (boardIds.length === 0) return c.json({ boards: [], cards: [] });

  const matchingBoards = await db
    .select()
    .from(board)
    .where(and(inArray(board.id, boardIds), like(board.name, like1)));

  const matchingCards = await db
    .select({
      id: card.id,
      title: card.title,
      description: card.description,
      boardId: card.boardId,
      listId: card.listId,
      boardName: board.name,
      listName: list.name,
    })
    .from(card)
    .innerJoin(board, eq(board.id, card.boardId))
    .innerJoin(list, eq(list.id, card.listId))
    .where(
      and(
        inArray(card.boardId, boardIds),
        eq(card.archived, false),
        or(like(card.title, like1), like(card.description, like1)),
      ),
    )
    .limit(50);

  return c.json({ boards: matchingBoards, cards: matchingCards });
});

// Cards due in a date range (used by calendar view)
router.get("/calendar", async (c) => {
  const db = c.get("db");
  const me = c.get("user");

  const myBoards = await db
    .select({ boardId: boardMember.boardId })
    .from(boardMember)
    .where(eq(boardMember.userId, me.id));
  const boardIds = myBoards.map((m) => m.boardId);
  if (boardIds.length === 0) return c.json({ cards: [] });

  const cards = await db
    .select({
      id: card.id,
      title: card.title,
      dueDate: card.dueDate,
      completedAt: card.completedAt,
      boardId: card.boardId,
      boardName: board.name,
      boardColor: board.color,
      listName: list.name,
    })
    .from(card)
    .innerJoin(board, eq(board.id, card.boardId))
    .innerJoin(list, eq(list.id, card.listId))
    .where(and(inArray(card.boardId, boardIds), eq(card.archived, false)));

  return c.json({ cards: cards.filter((cd) => cd.dueDate !== null) });
});

export default router;
