import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppContext } from "../index";
import { card, attachment } from "../db/schema";
import { newId } from "../lib/ids";
import { requireRole } from "../lib/permissions";
import { logActivity } from "../lib/activity";

const router = new Hono<AppContext>();

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// ─── Upload an attachment to a card (multipart/form-data: file, cardId) ──
router.post("/", async (c) => {
  const db = c.get("db");
  const me = c.get("user");

  const form = await c.req.formData();
  const fileEntry = form.get("file");
  const cardId = String(form.get("cardId") ?? "");
  // FormDataEntryValue is `File | string`; treat anything with .stream() as a file.
  if (!cardId || typeof fileEntry === "string" || fileEntry === null) {
    return c.json({ error: "Missing cardId or file" }, 400);
  }
  const file = fileEntry as unknown as {
    name: string;
    type: string;
    size: number;
    stream(): ReadableStream;
  };
  if (file.size > MAX_BYTES) {
    return c.json({ error: "File too large (max 25 MB)" }, 400);
  }

  const [cd] = await db.select().from(card).where(eq(card.id, cardId)).limit(1);
  if (!cd) return c.json({ error: "Card not found" }, 404);
  await requireRole(db, cd.boardId, me.id, "member");

  const id = newId("att");
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const storageKey = `${cd.boardId}/${cd.id}/${id}.${ext}`;

  await c.env.ATTACHMENTS.put(storageKey, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  await db.insert(attachment).values({
    id,
    cardId,
    boardId: cd.boardId,
    storageKey,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    uploadedBy: me.id,
  });

  await logActivity(db, {
    boardId: cd.boardId,
    cardId,
    actorId: me.id,
    type: "attachment.added",
    data: { cardTitle: cd.title, filename: file.name },
  });

  const [created] = await db.select().from(attachment).where(eq(attachment.id, id)).limit(1);
  return c.json({ attachment: created }, 201);
});

// ─── Stream an attachment back ──────────────────────────────────────────
router.get("/:id/file", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const [att] = await db.select().from(attachment).where(eq(attachment.id, id)).limit(1);
  if (!att) return c.json({ error: "Not found" }, 404);
  await requireRole(db, att.boardId, me.id, "viewer");

  const obj = await c.env.ATTACHMENTS.get(att.storageKey);
  if (!obj) return c.json({ error: "Object missing" }, 404);

  return new Response(obj.body, {
    headers: {
      "Content-Type": att.contentType,
      "Content-Length": String(att.sizeBytes),
      "Content-Disposition": `inline; filename="${encodeURIComponent(att.filename)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});

router.delete("/:id", async (c) => {
  const db = c.get("db");
  const me = c.get("user");
  const id = c.req.param("id");
  const [att] = await db.select().from(attachment).where(eq(attachment.id, id)).limit(1);
  if (!att) return c.json({ error: "Not found" }, 404);
  await requireRole(db, att.boardId, me.id, "member");

  await c.env.ATTACHMENTS.delete(att.storageKey);
  await db.delete(attachment).where(eq(attachment.id, id));

  await logActivity(db, {
    boardId: att.boardId,
    cardId: att.cardId,
    actorId: me.id,
    type: "attachment.deleted",
    data: { filename: att.filename },
  });
  return c.json({ ok: true });
});

export default router;
