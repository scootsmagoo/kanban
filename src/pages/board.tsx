import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  closestCorners,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, ArrowLeft, Settings, Users, History } from "lucide-react";
import { api, type Board, type Card, type Label, type List } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { KanbanList } from "@/components/kanban-list";
import { KanbanCard } from "@/components/kanban-card";
import { CardDetailModal } from "@/components/card-detail-modal";
import { BoardSettingsSheet } from "@/components/board-settings-sheet";
import { BoardMembersSheet } from "@/components/board-members-sheet";
import { ActivitySheet } from "@/components/activity-sheet";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface BoardPayload {
  board: Board & { role: string };
  lists: List[];
  cards: Card[];
  labels: Label[];
}

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [params, setParams] = useSearchParams();
  const openCardId = params.get("card");
  const qc = useQueryClient();

  const [openSheet, setOpenSheet] = useState<"settings" | "members" | "activity" | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => api.get<BoardPayload>(`/api/boards/${boardId}`),
    enabled: !!boardId,
  });

  // Local state for drag (overlay + optimistic ordering)
  const [localLists, setLocalLists] = useState<List[]>([]);
  const [localCards, setLocalCards] = useState<Card[]>([]);
  useEffect(() => {
    if (data) {
      setLocalLists(data.lists);
      setLocalCards(data.cards);
    }
  }, [data]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const cardsByList = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const l of localLists) map.set(l.id, []);
    for (const c of localCards) {
      if (!map.has(c.listId)) map.set(c.listId, []);
      map.get(c.listId)!.push(c);
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.position < b.position ? -1 : 1));
    return map;
  }, [localLists, localCards]);

  const moveCardMut = useMutation({
    mutationFn: (input: {
      cardId: string;
      listId: string;
      beforeCardId?: string;
      afterCardId?: string;
    }) =>
      api.post(`/api/cards/${input.cardId}/move`, {
        listId: input.listId,
        beforeCardId: input.beforeCardId,
        afterCardId: input.afterCardId,
      }),
    onError: (e: Error) => {
      toast.error(`Move failed: ${e.message}`);
      qc.invalidateQueries({ queryKey: ["board", boardId] });
    },
  });

  const moveListMut = useMutation({
    mutationFn: (input: { listId: string; beforeListId?: string; afterListId?: string }) =>
      api.post(`/api/lists/${input.listId}/move`, {
        beforeListId: input.beforeListId,
        afterListId: input.afterListId,
      }),
    onError: (e: Error) => {
      toast.error(`Move failed: ${e.message}`);
      qc.invalidateQueries({ queryKey: ["board", boardId] });
    },
  });

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (activeIdStr === overIdStr) return;

    const isActiveCard = active.data.current?.type === "card";
    if (!isActiveCard) return;

    const overIsCard = over.data.current?.type === "card";
    const overIsList = over.data.current?.type === "list";

    setLocalCards((cards) => {
      const activeIdx = cards.findIndex((c) => c.id === activeIdStr);
      if (activeIdx === -1) return cards;
      const activeCard = cards[activeIdx];

      let newListId = activeCard.listId;
      let insertBefore: Card | null = null;

      if (overIsCard) {
        const overCard = cards.find((c) => c.id === overIdStr);
        if (!overCard) return cards;
        newListId = overCard.listId;
        insertBefore = overCard;
      } else if (overIsList) {
        newListId = overIdStr;
        insertBefore = null;
      }

      if (
        activeCard.listId === newListId &&
        (insertBefore?.id === activeCard.id || cards[activeIdx + 1]?.id === insertBefore?.id)
      ) {
        return cards;
      }

      const next = cards.filter((c) => c.id !== activeIdStr);
      let insertIdx: number;
      if (insertBefore) {
        insertIdx = next.findIndex((c) => c.id === insertBefore!.id);
      } else {
        const lastInList = next.filter((c) => c.listId === newListId).at(-1);
        insertIdx = lastInList ? next.findIndex((c) => c.id === lastInList.id) + 1 : next.length;
      }

      next.splice(insertIdx, 0, { ...activeCard, listId: newListId });
      return next;
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const isList = active.data.current?.type === "list";
    const isCard = active.data.current?.type === "card";

    if (isList) {
      // Reorder lists
      setLocalLists((lists) => {
        const fromIdx = lists.findIndex((l) => l.id === activeId);
        const toIdx = lists.findIndex((l) => l.id === overId);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return lists;
        const next = [...lists];
        const [m] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, m);

        const before = next[toIdx - 1]?.id;
        const after = next[toIdx + 1]?.id;
        moveListMut.mutate({ listId: activeId, beforeListId: before, afterListId: after });
        return next;
      });
      return;
    }

    if (isCard) {
      // The card is already in the right spot in localCards; persist the move.
      const card = localCards.find((c) => c.id === activeId);
      if (!card) return;
      const inList = localCards
        .filter((c) => c.listId === card.listId)
        .sort((a, b) => (a.position < b.position ? -1 : 1));
      const idx = inList.findIndex((c) => c.id === activeId);
      const before = inList[idx - 1]?.id;
      const after = inList[idx + 1]?.id;
      moveCardMut.mutate({
        cardId: activeId,
        listId: card.listId,
        beforeCardId: before,
        afterCardId: after,
      });
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p className="text-destructive">{(error as Error)?.message ?? "Board not found"}</p>
        <Button asChild variant="outline">
          <Link to="/">
            <ArrowLeft className="size-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: data.board.color + "12" }}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-card/60 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link to="/">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div
            className="size-3 rounded-full shrink-0"
            style={{ backgroundColor: data.board.color }}
          />
          <h1 className="text-lg font-semibold truncate">{data.board.name}</h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setOpenSheet("members")}>
            <Users className="size-4" />
            Members
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpenSheet("activity")}>
            <History className="size-4" />
            Activity
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpenSheet("settings")}>
            <Settings className="size-4" />
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto overflow-y-hidden kanban-scroll">
          <div className="flex h-full items-start gap-3 p-4">
            <SortableContext
              items={localLists.map((l) => l.id)}
              strategy={horizontalListSortingStrategy}
            >
              {localLists.map((list) => (
                <KanbanList
                  key={list.id}
                  list={list}
                  cards={cardsByList.get(list.id) ?? []}
                  boardId={data.board.id}
                  labels={data.labels}
                />
              ))}
            </SortableContext>
            <AddListButton boardId={data.board.id} lastListId={localLists.at(-1)?.id} />
          </div>
        </div>

        <DragOverlay>
          {activeId
            ? (() => {
                const card = localCards.find((c) => c.id === activeId);
                if (card) {
                  return (
                    <div className="kanban-card-dragging">
                      <KanbanCard card={card} labels={data.labels} dragOverlay />
                    </div>
                  );
                }
                const list = localLists.find((l) => l.id === activeId);
                if (list) {
                  return (
                    <div className="kanban-card-dragging w-72 rounded-lg bg-list-bg p-3">
                      <div className="font-medium">{list.name}</div>
                    </div>
                  );
                }
                return null;
              })()
            : null}
        </DragOverlay>
      </DndContext>

      {openCardId && (
        <CardDetailModal
          cardId={openCardId}
          boardId={data.board.id}
          labels={data.labels}
          onClose={() => {
            const next = new URLSearchParams(params);
            next.delete("card");
            setParams(next, { replace: true });
          }}
        />
      )}

      {openSheet === "settings" && (
        <BoardSettingsSheet board={data.board} onClose={() => setOpenSheet(null)} />
      )}
      {openSheet === "members" && (
        <BoardMembersSheet boardId={data.board.id} onClose={() => setOpenSheet(null)} />
      )}
      {openSheet === "activity" && (
        <ActivitySheet boardId={data.board.id} onClose={() => setOpenSheet(null)} />
      )}
    </div>
  );
}

function AddListButton({ boardId, lastListId }: { boardId: string; lastListId?: string }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () =>
      api.post("/api/lists", { boardId, name, afterListId: lastListId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", boardId] });
      setName("");
      setAdding(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!adding) {
    return (
      <Button
        variant="ghost"
        onClick={() => setAdding(true)}
        className="h-10 w-72 justify-start gap-2 rounded-lg bg-card/40 hover:bg-card/70 backdrop-blur shrink-0"
      >
        <Plus className="size-4" />
        Add a list
      </Button>
    );
  }

  return (
    <div className="w-72 shrink-0 rounded-lg bg-list-bg p-2 shadow-sm">
      <Input
        autoFocus
        placeholder="List name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) create.mutate();
          if (e.key === "Escape") setAdding(false);
        }}
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
          Add list
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
