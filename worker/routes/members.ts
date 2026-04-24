import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { Resend } from "resend";
import type { AppContext } from "../index";
import { board, boardMember, boardInvite, user } from "../db/schema";
import { newId } from "../lib/ids";
import { requireRole } from "../lib/permissions";
import { logActivity } from "../lib/activity";
import { customAlphabet } from "nanoid";

const router = new Hono<AppContext>();
const tokenGen = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 32);

// ─── List members of a board ─────────────────────────────────────────────
router.get("/:boardId", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const boardId = c.req.param("boardId");
  await requireRole(db, boardId, me.id, "viewer");

  const members = await db
    .select({
      userId: boardMember.userId,
      role: boardMember.role,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(boardMember)
    .innerJoin(user, eq(user.id, boardMember.userId))
    .where(eq(boardMember.boardId, boardId));

  const invites = await db
    .select()
    .from(boardInvite)
    .where(eq(boardInvite.boardId, boardId));

  return c.json({ members, invites: invites.filter((i) => !i.acceptedAt) });
});

// ─── Invite by email ─────────────────────────────────────────────────────
const inviteSchema = z.object({
  boardId: z.string(),
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

router.post("/invite", zValidator("json", inviteSchema), async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const { boardId, email, role } = c.req.valid("json");
  await requireRole(db, boardId, me.id, "admin");

  const [b] = await db.select().from(board).where(eq(board.id, boardId)).limit(1);
  if (!b) return c.json({ error: "Board not found" }, 404);

  // If already a user, add directly.
  const [existingUser] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (existingUser) {
    await db
      .insert(boardMember)
      .values({ boardId, userId: existingUser.id, role })
      .onConflictDoNothing();
    await logActivity(db, {
      boardId,
      actorId: me.id,
      type: "member.joined",
      data: { name: existingUser.name, email },
    });
    return c.json({ ok: true, addedDirectly: true });
  }

  // Otherwise create an invite token.
  const id = newId("inv");
  const token = tokenGen();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(boardInvite).values({
    id,
    boardId,
    email,
    role,
    invitedBy: me.id,
    token,
    expiresAt,
  });

  const inviteUrl = `${c.env.APP_URL}/invite/${token}`;
  if (c.env.RESEND_API_KEY) {
    const resend = new Resend(c.env.RESEND_API_KEY);
    await resend.emails.send({
      from: c.env.RESEND_FROM_EMAIL || "Kanban <noreply@example.com>",
      to: email,
      subject: `${me.name} invited you to "${b.name}"`,
      html: `<p>You've been invited to collaborate on the <b>${escapeHtml(b.name)}</b> board.</p>
             <p><a href="${inviteUrl}" style="background:#0ea5e9;color:white;padding:10px 16px;border-radius:6px;text-decoration:none">Accept invite</a></p>`,
    });
  } else {
    console.warn("[invite] RESEND_API_KEY not set; invite URL:", inviteUrl);
  }

  await logActivity(db, {
    boardId,
    actorId: me.id,
    type: "member.invited",
    data: { email, role },
  });

  return c.json({ ok: true, inviteUrl });
});

// ─── Accept invite ───────────────────────────────────────────────────────
router.post("/invite/:token/accept", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const token = c.req.param("token");
  const [inv] = await db
    .select()
    .from(boardInvite)
    .where(eq(boardInvite.token, token))
    .limit(1);
  if (!inv) return c.json({ error: "Invalid invite" }, 404);
  if (inv.acceptedAt) return c.json({ error: "Already accepted" }, 400);
  if (inv.expiresAt.getTime() < Date.now()) {
    return c.json({ error: "Invite expired" }, 400);
  }

  await db
    .insert(boardMember)
    .values({ boardId: inv.boardId, userId: me.id, role: inv.role })
    .onConflictDoNothing();
  await db
    .update(boardInvite)
    .set({ acceptedAt: new Date() })
    .where(eq(boardInvite.id, inv.id));

  await logActivity(db, {
    boardId: inv.boardId,
    actorId: me.id,
    type: "member.joined",
    data: { name: me.name, email: me.email },
  });

  return c.json({ ok: true, boardId: inv.boardId });
});

// ─── Update role ─────────────────────────────────────────────────────────
router.patch(
  "/:boardId/:userId",
  zValidator("json", z.object({ role: z.enum(["admin", "member", "viewer"]) })),
  async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const boardId = c.req.param("boardId");
    const userId = c.req.param("userId");
    await requireRole(db, boardId, me.id, "admin");

    await db
      .update(boardMember)
      .set({ role: c.req.valid("json").role })
      .where(and(eq(boardMember.boardId, boardId), eq(boardMember.userId, userId)));
    return c.json({ ok: true });
  },
);

// ─── Remove member ───────────────────────────────────────────────────────
router.delete("/:boardId/:userId", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const boardId = c.req.param("boardId");
  const userId = c.req.param("userId");
  await requireRole(db, boardId, me.id, "admin");

  await db
    .delete(boardMember)
    .where(and(eq(boardMember.boardId, boardId), eq(boardMember.userId, userId)));

  await logActivity(db, {
    boardId,
    actorId: me.id,
    type: "member.removed",
    data: { userId },
  });
  return c.json({ ok: true });
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (m) =>
    m === "&" ? "&amp;" : m === "<" ? "&lt;" : m === ">" ? "&gt;" : m === '"' ? "&quot;" : "&#39;",
  );
}

export default router;
