import type { DB } from "../db/client";
import { activity } from "../db/schema";
import { newId } from "./ids";

export type ActivityType =
  | "board.created"
  | "board.updated"
  | "list.created"
  | "list.renamed"
  | "list.archived"
  | "list.moved"
  | "card.created"
  | "card.renamed"
  | "card.described"
  | "card.moved"
  | "card.archived"
  | "card.due_set"
  | "card.due_cleared"
  | "card.completed"
  | "card.uncompleted"
  | "card.assigned"
  | "card.unassigned"
  | "card.labeled"
  | "card.unlabeled"
  | "comment.added"
  | "comment.deleted"
  | "checklist.added"
  | "checklist.item.toggled"
  | "attachment.added"
  | "attachment.deleted"
  | "member.invited"
  | "member.joined"
  | "member.removed";

export async function logActivity(
  db: DB,
  args: {
    boardId: string;
    cardId?: string | null;
    actorId: string;
    type: ActivityType;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(activity).values({
    id: newId("act"),
    boardId: args.boardId,
    cardId: args.cardId ?? null,
    actorId: args.actorId,
    type: args.type,
    data: args.data ?? {},
  });
}
