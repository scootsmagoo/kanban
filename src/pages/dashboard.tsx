import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, LayoutGrid } from "lucide-react";
import { api, type Board } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const COLORS = ["#0ea5e9", "#22c55e", "#eab308", "#f97316", "#ef4444", "#a855f7", "#ec4899", "#14b8a6"];

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["boards"],
    queryFn: () => api.get<{ boards: Board[] }>("/api/boards"),
  });

  const boards = data?.boards ?? [];

  return (
    <div className="h-full overflow-auto kanban-scroll">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your boards</h1>
            <p className="text-sm text-muted-foreground mt-1">
              One board per project. Drag cards through stages to keep work moving.
            </p>
          </div>
          <CreateBoardDialog />
        </div>

        {isLoading ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-lg border bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : boards.length === 0 ? (
          <div className="mt-12 flex flex-col items-center text-center gap-3 rounded-xl border-2 border-dashed py-16 px-6">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
              <LayoutGrid className="size-6" />
            </div>
            <h2 className="text-lg font-semibold">No boards yet</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Create your first board to start organizing a project. We'll seed it with To-Do,
              Doing, and Done columns.
            </p>
            <CreateBoardDialog />
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((b) => (
              <BoardCard key={b.id} board={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BoardCard({ board }: { board: Board }) {
  return (
    <Link
      to={`/b/${board.id}`}
      className="group relative overflow-hidden rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
    >
      <div
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ backgroundColor: board.color }}
        aria-hidden
      />
      <h3 className="font-semibold text-base mt-1 truncate">{board.name}</h3>
      {board.description ? (
        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{board.description}</p>
      ) : (
        <p className="text-sm text-muted-foreground/60 mt-1 italic">No description</p>
      )}
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className="capitalize">{board.role ?? "member"}</span>
        <span>Updated {timeAgo(board.updatedAt)}</span>
      </div>
    </Link>
  );
}

function CreateBoardDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: () =>
      api.post<{ board: Board }>("/api/boards", { name, description: description || undefined, color }),
    onSuccess: () => {
      toast.success("Board created");
      qc.invalidateQueries({ queryKey: ["boards"] });
      setOpen(false);
      setName("");
      setDescription("");
      setColor(COLORS[0]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          New board
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create board</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Co — website redesign"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description (optional)</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full transition-transform ${
                    color === c ? "ring-2 ring-offset-2 ring-ring scale-110" : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              Create board
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function timeAgo(ts: number): string {
  const d = Date.now() - ts * 1000;
  const m = Math.floor(d / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
