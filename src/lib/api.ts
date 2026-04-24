// Tiny typed fetch wrapper for our Hono API.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (body !== undefined && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers,
    body:
      body instanceof FormData
        ? body
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
    ...init,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, body?: unknown) => request<T>("POST", p, body),
  patch: <T>(p: string, body?: unknown) => request<T>("PATCH", p, body),
  delete: <T>(p: string) => request<T>("DELETE", p),
  upload: <T>(p: string, form: FormData) => request<T>("POST", p, form),
};

// ─── Shared types matching the API responses ────────────────────────────
export type Role = "owner" | "admin" | "member" | "viewer";

export interface Board {
  id: string;
  name: string;
  description: string | null;
  color: string;
  ownerId: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  role?: Role;
}

export interface List {
  id: string;
  boardId: string;
  name: string;
  position: string;
  archived: boolean;
}

export interface Card {
  id: string;
  boardId: string;
  listId: string;
  title: string;
  description: string | null;
  position: string;
  dueDate: number | null;
  completedAt: number | null;
  archived: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface Label {
  id: string;
  boardId: string;
  name: string;
  color: string;
}

export interface Member {
  userId: string;
  role: Role;
  name: string;
  email: string;
  image: string | null;
}

export interface CommentRow {
  id: string;
  cardId: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  authorId: string;
  authorName: string;
  authorImage: string | null;
}

export interface AttachmentRow {
  id: string;
  cardId: string;
  boardId: string;
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: number;
}

export interface ChecklistItem {
  id: string;
  checklistId: string;
  text: string;
  completed: boolean;
  position: string;
}

export interface Checklist {
  id: string;
  cardId: string;
  title: string;
  position: string;
  items: ChecklistItem[];
}

export interface ActivityRow {
  id: string;
  boardId: string;
  cardId: string | null;
  type: string;
  data: Record<string, unknown>;
  createdAt: number;
  actorId: string;
  actorName: string;
  actorImage: string | null;
}
