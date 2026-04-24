import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlignLeft,
  CalendarDays,
  CheckSquare,
  MessageSquare,
  Paperclip,
  Tag,
  Users,
  Trash2,
  Archive,
  X,
} from "lucide-react";
import { format } from "date-fns";
import {
  api,
  type Card,
  type Checklist,
  type CommentRow,
  type AttachmentRow,
  type Label,
  type Member,
} from "@/lib/api";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "./markdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, dateFromApiTimestamp, formatBytes, initials, readableTextColor } from "@/lib/utils";
import { toast } from "sonner";

interface Detail {
  card: Card;
  labelIds: string[];
  assignees: Array<{ id: string; name: string; email: string; image: string | null }>;
  checklists: Checklist[];
  comments: CommentRow[];
  attachments: AttachmentRow[];
}

interface Props {
  cardId: string;
  boardId: string;
  labels: Label[];
  onClose: () => void;
}

export function CardDetailModal({ cardId, boardId, labels, onClose }: Props) {
  const qc = useQueryClient();
  const detailKey = ["card", cardId];

  const { data, isLoading } = useQuery({
    queryKey: detailKey,
    queryFn: () => api.get<Detail>(`/api/cards/${cardId}`),
  });

  const { data: members } = useQuery({
    queryKey: ["members", boardId],
    queryFn: () => api.get<{ members: Member[] }>(`/api/members/${boardId}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: detailKey });
    qc.invalidateQueries({ queryKey: ["board", boardId] });
  };

  const updateCardMut = useMutation({
    mutationFn: (patch: Partial<Card> & { dueDate?: number | null; completedAt?: number | null }) =>
      api.patch(`/api/cards/${cardId}`, patch),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: () => api.patch(`/api/cards/${cardId}`, { archived: true }),
    onSuccess: () => {
      invalidate();
      onClose();
      toast.success("Card archived");
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/cards/${cardId}`),
    onSuccess: () => {
      invalidate();
      onClose();
      toast.success("Card deleted");
    },
  });

  const toggleLabelMut = useMutation({
    mutationFn: ({ labelId, on }: { labelId: string; on: boolean }) =>
      on
        ? api.post(`/api/cards/${cardId}/labels/${labelId}`)
        : api.delete(`/api/cards/${cardId}/labels/${labelId}`),
    onSuccess: invalidate,
  });

  const toggleAssigneeMut = useMutation({
    mutationFn: ({ userId, on }: { userId: string; on: boolean }) =>
      on
        ? api.post(`/api/cards/${cardId}/assignees/${userId}`)
        : api.delete(`/api/cards/${cardId}/assignees/${userId}`),
    onSuccess: invalidate,
  });

  if (isLoading || !data) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="sr-only">Loading card</DialogTitle>
          <div className="h-64 animate-pulse rounded bg-muted/40" />
        </DialogContent>
      </Dialog>
    );
  }

  const { card, labelIds, assignees, checklists, comments, attachments } = data;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-0" hideClose>
        <div className="flex flex-col">
          <div className="px-6 pt-6 pb-3 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle
                value={card.title}
                onSave={(title) => updateCardMut.mutate({ title })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Created{" "}
                {format(dateFromApiTimestamp(card.createdAt) ?? new Date(0), "MMM d, yyyy")}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-6 px-6 pb-6">
            <div className="space-y-6 min-w-0">
              {/* Labels + Members + Due strip */}
              <div className="flex flex-wrap gap-4">
                {labelIds.length > 0 && (
                  <Section title="Labels" icon={<Tag className="size-3.5" />}>
                    <div className="flex flex-wrap gap-1">
                      {labelIds
                        .map((id) => labels.find((l) => l.id === id))
                        .filter(Boolean)
                        .map((l) => (
                          <span
                            key={l!.id}
                            className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: l!.color,
                              color: readableTextColor(l!.color),
                            }}
                          >
                            {l!.name || "·"}
                          </span>
                        ))}
                    </div>
                  </Section>
                )}
                {assignees.length > 0 && (
                  <Section title="Members" icon={<Users className="size-3.5" />}>
                    <div className="flex -space-x-1.5">
                      {assignees.map((u) => (
                        <Avatar key={u.id} className="border-2 border-background">
                          {u.image && <AvatarImage src={u.image} alt={u.name} />}
                          <AvatarFallback>{initials(u.name)}</AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                  </Section>
                )}
                {card.dueDate && (
                  <Section title="Due date" icon={<CalendarDays className="size-3.5" />}>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={!!card.completedAt}
                        onCheckedChange={(v) =>
                          updateCardMut.mutate({
                            completedAt: v ? Math.floor(Date.now() / 1000) : null,
                          })
                        }
                      />
                      <span className="text-sm">
                        {format(
                          dateFromApiTimestamp(card.dueDate) ?? new Date(0),
                          "MMM d, yyyy",
                        )}
                      </span>
                    </div>
                  </Section>
                )}
              </div>

              {/* Description */}
              <div>
                <SectionHeading icon={<AlignLeft className="size-4" />}>Description</SectionHeading>
                <DescriptionEditor
                  value={card.description ?? ""}
                  onSave={(description) => updateCardMut.mutate({ description: description || null })}
                />
              </div>

              {/* Checklists */}
              {checklists.map((cl) => (
                <ChecklistView key={cl.id} checklist={cl} cardId={cardId} onChange={invalidate} />
              ))}

              {/* Attachments */}
              {attachments.length > 0 && (
                <div>
                  <SectionHeading icon={<Paperclip className="size-4" />}>
                    Attachments
                  </SectionHeading>
                  <div className="mt-2 grid gap-2">
                    {attachments.map((a) => (
                      <AttachmentRow key={a.id} attachment={a} onDelete={invalidate} />
                    ))}
                  </div>
                </div>
              )}

              {/* Comments */}
              <div>
                <SectionHeading icon={<MessageSquare className="size-4" />}>
                  Comments
                </SectionHeading>
                <CommentComposer cardId={cardId} onPosted={invalidate} />
                <div className="mt-3 space-y-3">
                  {comments
                    .slice()
                    .reverse()
                    .map((c) => (
                      <CommentItem key={c.id} comment={c} onChange={invalidate} />
                    ))}
                </div>
              </div>
            </div>

            <aside className="space-y-2">
              <SidebarLabel>Add to card</SidebarLabel>

              <LabelPicker
                labels={labels}
                selected={labelIds}
                onToggle={(id, on) => toggleLabelMut.mutate({ labelId: id, on })}
              />

              <MemberPicker
                members={members?.members ?? []}
                selected={assignees.map((a) => a.id)}
                onToggle={(id, on) => toggleAssigneeMut.mutate({ userId: id, on })}
              />

              <DueDatePicker
                value={dateFromApiTimestamp(card.dueDate)}
                onChange={(d) =>
                  updateCardMut.mutate({ dueDate: d ? Math.floor(d.getTime() / 1000) : null })
                }
              />

              <ChecklistAdder cardId={cardId} onAdded={invalidate} />

              <AttachmentUploader cardId={cardId} onUploaded={invalidate} />

              <SidebarLabel className="pt-3">Actions</SidebarLabel>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => archiveMut.mutate()}
              >
                <Archive className="size-4" />
                Archive
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-destructive"
                onClick={() => {
                  if (confirm("Delete this card permanently?")) deleteMut.mutate();
                }}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1.5">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 font-semibold text-sm">
      {icon}
      {children}
    </div>
  );
}

function SidebarLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("text-xs font-semibold text-muted-foreground uppercase tracking-wide", className)}>
      {children}
    </div>
  );
}

function CardTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() && draft !== value) onSave(draft.trim());
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (draft.trim() && draft !== value) onSave(draft.trim());
            setEditing(false);
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="text-lg font-semibold h-9"
      />
    );
  }
  return (
    <button
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="text-lg font-semibold leading-tight text-left w-full hover:bg-accent/50 rounded px-1 -ml-1"
    >
      {value}
    </button>
  );
}

function DescriptionEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return value ? (
      <button
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="block w-full text-left mt-2 rounded p-3 bg-muted/40 hover:bg-muted/60"
      >
        <Markdown>{value}</Markdown>
      </button>
    ) : (
      <button
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        className="block w-full text-left mt-2 rounded p-3 bg-muted/30 text-sm text-muted-foreground hover:bg-muted/50"
      >
        Add a more detailed description...
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <Textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
        placeholder="Markdown supported — **bold**, [links](https://...), `code`, lists..."
        className="font-mono text-sm"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ChecklistView({
  checklist,
  cardId,
  onChange,
}: {
  checklist: Checklist;
  cardId: string;
  onChange: () => void;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const done = checklist.items.filter((i) => i.completed).length;
  const total = checklist.items.length;
  const pct = total === 0 ? 0 : (done / total) * 100;

  const toggleItem = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      api.patch(`/api/checklists/items/${id}`, { completed }),
    onSuccess: onChange,
  });
  const deleteItem = useMutation({
    mutationFn: (id: string) => api.delete(`/api/checklists/items/${id}`),
    onSuccess: onChange,
  });
  const addItem = useMutation({
    mutationFn: () => api.post("/api/checklists/items", { checklistId: checklist.id, text: newText }),
    onSuccess: () => {
      setNewText("");
      onChange();
    },
  });
  const deleteList = useMutation({
    mutationFn: () => api.delete(`/api/checklists/${checklist.id}`),
    onSuccess: () => {
      onChange();
      qc.invalidateQueries({ queryKey: ["card", cardId] });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <SectionHeading icon={<CheckSquare className="size-4" />}>{checklist.title}</SectionHeading>
        <Button variant="ghost" size="sm" onClick={() => deleteList.mutate()}>
          Delete
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums w-8 text-right">{Math.round(pct)}%</span>
        <div className="flex-1 h-1.5 bg-muted rounded">
          <div
            className="h-full bg-primary rounded transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <ul className="mt-2 space-y-1">
        {checklist.items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 px-1.5 py-1 rounded hover:bg-accent/40">
            <Checkbox
              checked={item.completed}
              onCheckedChange={(v) => toggleItem.mutate({ id: item.id, completed: !!v })}
            />
            <span className={cn("flex-1 text-sm", item.completed && "line-through text-muted-foreground")}>
              {item.text}
            </span>
            <button
              onClick={() => deleteItem.mutate(item.id)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              aria-label="Delete item"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="mt-2 flex gap-2">
          <Input
            autoFocus
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="New item"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newText.trim()) addItem.mutate();
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <Button size="sm" disabled={!newText.trim()} onClick={() => addItem.mutate()}>
            Add
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAdding(true)}>
          Add an item
        </Button>
      )}
    </div>
  );
}

function CommentComposer({ cardId, onPosted }: { cardId: string; onPosted: () => void }) {
  const [body, setBody] = useState("");
  const post = useMutation({
    mutationFn: () => api.post("/api/comments", { cardId, body }),
    onSuccess: () => {
      setBody("");
      onPosted();
    },
  });
  return (
    <div className="mt-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a comment... (Markdown supported)"
        rows={2}
      />
      {body.trim() && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" disabled={post.isPending} onClick={() => post.mutate()}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setBody("")}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

function CommentItem({ comment, onChange }: { comment: CommentRow; onChange: () => void }) {
  const del = useMutation({
    mutationFn: () => api.delete(`/api/comments/${comment.id}`),
    onSuccess: onChange,
  });
  return (
    <div className="flex gap-2.5">
      <Avatar className="size-7">
        {comment.authorImage && <AvatarImage src={comment.authorImage} alt={comment.authorName} />}
        <AvatarFallback>{initials(comment.authorName)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{comment.authorName}</span> ·{" "}
          {format(
            dateFromApiTimestamp(comment.createdAt) ?? new Date(0),
            "MMM d 'at' h:mm a",
          )}
        </div>
        <div className="mt-1 rounded bg-muted/40 p-2">
          <Markdown>{comment.body}</Markdown>
        </div>
        <button
          onClick={() => del.mutate()}
          className="mt-1 text-xs text-muted-foreground hover:text-destructive"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function AttachmentRow({
  attachment,
  onDelete,
}: {
  attachment: AttachmentRow;
  onDelete: () => void;
}) {
  const del = useMutation({
    mutationFn: () => api.delete(`/api/attachments/${attachment.id}`),
    onSuccess: onDelete,
  });
  const isImage = attachment.contentType.startsWith("image/");
  const url = `/api/attachments/${attachment.id}/file`;
  return (
    <div className="flex items-center gap-3 rounded border p-2">
      {isImage ? (
        <img
          src={url}
          alt={attachment.filename}
          className="h-12 w-16 object-cover rounded"
        />
      ) : (
        <div className="grid h-12 w-16 place-items-center rounded bg-muted text-muted-foreground">
          <Paperclip className="size-4" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium hover:underline truncate block"
        >
          {attachment.filename}
        </a>
        <div className="text-xs text-muted-foreground">
          {formatBytes(attachment.sizeBytes)} · added{" "}
          {format(dateFromApiTimestamp(attachment.createdAt) ?? new Date(0), "MMM d")}
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={() => del.mutate()} aria-label="Remove">
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function LabelPicker({
  labels,
  selected,
  onToggle,
}: {
  labels: Label[];
  selected: string[];
  onToggle: (id: string, on: boolean) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" className="w-full justify-start">
          <Tag className="size-4" />
          Labels
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-1.5">
        <div className="text-xs font-semibold text-muted-foreground">Toggle labels</div>
        <div className="space-y-1">
          {labels.map((l) => {
            const on = selected.includes(l.id);
            return (
              <button
                key={l.id}
                onClick={() => onToggle(l.id, !on)}
                className="flex items-center gap-2 w-full text-left rounded p-1.5 hover:bg-accent"
              >
                <span
                  className="h-5 flex-1 rounded px-2 text-xs font-medium leading-5 truncate"
                  style={{ backgroundColor: l.color, color: readableTextColor(l.color) }}
                >
                  {l.name || "·"}
                </span>
                {on && <CheckSquare className="size-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MemberPicker({
  members,
  selected,
  onToggle,
}: {
  members: Member[];
  selected: string[];
  onToggle: (id: string, on: boolean) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" className="w-full justify-start">
          <Users className="size-4" />
          Members
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-1.5">
        <div className="text-xs font-semibold text-muted-foreground">Assign members</div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {members.map((m) => {
            const on = selected.includes(m.userId);
            return (
              <button
                key={m.userId}
                onClick={() => onToggle(m.userId, !on)}
                className="flex items-center gap-2 w-full text-left rounded p-1.5 hover:bg-accent"
              >
                <Avatar className="size-6">
                  {m.image && <AvatarImage src={m.image} alt={m.name} />}
                  <AvatarFallback>{initials(m.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{m.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                </div>
                {on && <CheckSquare className="size-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DueDatePicker({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (d: Date | null) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" className="w-full justify-start">
          <CalendarDays className="size-4" />
          Due date
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(d) => onChange(d ?? null)}
          initialFocus
        />
        {value && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(null)}>
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ChecklistAdder({ cardId, onAdded }: { cardId: string; onAdded: () => void }) {
  const add = useMutation({
    mutationFn: () => api.post("/api/checklists", { cardId, title: "Checklist" }),
    onSuccess: onAdded,
  });
  return (
    <Button variant="secondary" className="w-full justify-start" onClick={() => add.mutate()}>
      <CheckSquare className="size-4" />
      Checklist
    </Button>
  );
}

function AttachmentUploader({
  cardId,
  onUploaded,
}: {
  cardId: string;
  onUploaded: () => void;
}) {
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("cardId", cardId);
      return api.upload("/api/attachments", form);
    },
    onSuccess: () => {
      onUploaded();
      toast.success("Uploaded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <label className="block">
      <input
        type="file"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload.mutate(f);
          e.target.value = "";
        }}
      />
      <span
        className={cn(
          "flex w-full items-center gap-2 cursor-pointer rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground shadow-sm hover:bg-secondary/80 transition-colors",
          upload.isPending && "opacity-60",
        )}
      >
        <Paperclip className="size-4" />
        {upload.isPending ? "Uploading..." : "Attachment"}
      </span>
    </label>
  );
}
