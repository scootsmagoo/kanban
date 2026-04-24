import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal, Plus, Pencil, Archive } from "lucide-react";
import { api, type Card, type Label, type List } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { KanbanCard } from "./kanban-card";
import { toast } from "sonner";

interface Props {
  list: List;
  cards: Card[];
  boardId: string;
  labels: Label[];
}

export function KanbanList({ list, cards, boardId, labels }: Props) {
  const qc = useQueryClient();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    data: { type: "list" },
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: list.id,
    data: { type: "list" },
  });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);

  const renameMut = useMutation({
    mutationFn: () => api.patch(`/api/lists/${list.id}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", boardId] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: () => api.patch(`/api/lists/${list.id}`, { archived: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const addCard = useMutation({
    mutationFn: () => api.post("/api/cards", { listId: list.id, title: newTitle }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", boardId] });
      setNewTitle("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="w-72 shrink-0 flex flex-col max-h-full rounded-lg bg-list-bg shadow-sm"
    >
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground p-1"
          aria-label="Drag list"
        >
          <GripVertical className="size-4" />
        </button>
        {editing ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => (name !== list.name && name.trim() ? renameMut.mutate() : setEditing(false))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) renameMut.mutate();
              if (e.key === "Escape") {
                setName(list.name);
                setEditing(false);
              }
            }}
            className="h-7 text-sm font-medium"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex-1 text-left text-sm font-semibold truncate px-1 py-0.5 rounded hover:bg-accent/60"
          >
            {list.name}
          </button>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">{cards.length}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Add card
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => archiveMut.mutate()}>
              <Archive className="size-4" />
              Archive list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={setDropRef}
        className="flex-1 overflow-y-auto kanban-scroll px-2 pb-2 flex flex-col gap-2 min-h-2"
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard key={card.id} card={card} labels={labels} />
          ))}
        </SortableContext>
      </div>

      {adding ? (
        <div className="p-2 border-t">
          <Textarea
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Card title"
            className="min-h-16 resize-none bg-card"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (newTitle.trim()) addCard.mutate();
              }
              if (e.key === "Escape") {
                setNewTitle("");
                setAdding(false);
              }
            }}
          />
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              disabled={!newTitle.trim() || addCard.isPending}
              onClick={() => addCard.mutate()}
            >
              Add card
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setNewTitle("");
                setAdding(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="m-2 mt-0 flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 rounded"
        >
          <Plus className="size-4" />
          Add a card
        </button>
      )}
    </div>
  );
}
