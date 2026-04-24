import { and, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { boardMember } from "../db/schema";

export type Role = "owner" | "admin" | "member" | "viewer";

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export async function getMembership(db: DB, boardId: string, userId: string) {
  const rows = await db
    .select()
    .from(boardMember)
    .where(and(eq(boardMember.boardId, boardId), eq(boardMember.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function requireRole(
  db: DB,
  boardId: string,
  userId: string,
  minRole: Role,
): Promise<Role> {
  const membership = await getMembership(db, boardId, userId);
  if (!membership) {
    throw Object.assign(new Error("Forbidden: not a board member"), { status: 403 });
  }
  const role = membership.role as Role;
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw Object.assign(new Error(`Forbidden: ${minRole} required`), { status: 403 });
  }
  return role;
}

export function canEdit(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.member;
}
