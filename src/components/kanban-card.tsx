import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, CheckSquare, MessageSquare, Paperclip } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format, isPast, isToday } from "date-fns";
import { api, type Card, type Label } from "@/lib/api";
import { cn, dateFromApiTimestamp, readableTextColor } from "@/lib/utils";

interface Props {
  card: Card;
  labels: Label[];
  dragOverlay?: boolean;
}

interface CardDetailLite {
  card: Card;
  labelIds: string[];
  checklists: Array<{ items: Array<{ completed: boolean }> }>;
  comments: unknown[];
  attachments: unknown[];
}

export function KanbanCard({ card, labels, dragOverlay }: Props) {
  const [params, setParams] = useSearchParams();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", listId: card.listId },
  });

  // Cheap in-place fetch for badges (cached by react-query). We piggy-back on
  // the modal's query key so opening the modal is instant.
  const { data: detail } = useQuery({
    queryKey: ["card", card.id],
    queryFn: () => api.get<CardDetailLite>(`/api/cards/${card.id}`),
    enabled: !dragOverlay,
    staleTime: 60_000,
  });

  const cardLabels = (detail?.labelIds ?? []).map((id) => labels.find((l) => l.id === id)).filter(Boolean) as Label[];
  const totalItems = detail?.checklists.reduce((sum, cl) => sum + cl.items.length, 0) ?? 0;
  const doneItems = detail?.checklists.reduce(
    (sum, cl) => sum + cl.items.filter((it) => it.completed).length,
    0,
  ) ?? 0;
  const commentCount = detail?.comments.length ?? 0;
  const attachmentCount = detail?.attachments.length ?? 0;

  const due = dateFromApiTimestamp(card.dueDate);
  const isCompleted = !!card.completedAt;

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (isDragging) return;
        e.preventDefault();
        const next = new URLSearchParams(params);
        next.set("card", card.id);
        setParams(next, { replace: false });
      }}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={cn(
        "group w-full text-left rounded-md bg-card border p-2.5 shadow-sm hover:border-primary/60 transition-colors cursor-pointer",
        dragOverlay && "shadow-xl",
      )}
    >
      {cardLabels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {cardLabels.map((l) => (
            <span
              key={l.id}
              className="h-1.5 w-8 rounded-full"
              style={{ backgroundColor: l.color }}
              title={l.name || undefined}
            />
          ))}
        </div>
      )}
      <div className={cn("text-sm leading-snug", isCompleted && "line-through text-muted-foreground")}>
        {card.title}
      </div>
      {(due || totalItems > 0 || commentCount > 0 || attachmentCount > 0) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {due && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
                isCompleted
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : isPast(due) && !isToday(due)
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : isToday(due)
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                      : "",
              )}
            >
              <CalendarDays className="size-3" />
              {format(due, "MMM d")}
            </span>
          )}
          {totalItems > 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                doneItems === totalItems && "text-green-600 dark:text-green-400",
              )}
            >
              <CheckSquare className="size-3" />
              {doneItems}/{totalItems}
            </span>
          )}
          {commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3" />
              {commentCount}
            </span>
          )}
          {attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3" />
              {attachmentCount}
            </span>
          )}
        </div>
      )}
      {void readableTextColor /* keep helper handy for label name chips later */}
    </button>
  );
}
