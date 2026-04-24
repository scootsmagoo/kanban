import { useState, useEffect, useRef } from "react";
import { Search, Hash, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type Board } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchResult {
  boards: Board[];
  cards: Array<{
    id: string;
    title: string;
    description: string | null;
    boardId: string;
    boardName: string;
    listName: string;
  }>;
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["search", query],
    queryFn: () => api.get<SearchResult>(`/api/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
  });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const showResults = open && query.length >= 2;
  const hasResults = data && (data.boards.length > 0 || data.cards.length > 0);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search boards & cards..."
          className="pl-8"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && query.trim()) {
              navigate(`/search?q=${encodeURIComponent(query.trim())}`);
              setOpen(false);
            }
          }}
        />
      </div>

      {showResults && (
        <div className="absolute left-0 right-0 top-full mt-2 max-h-96 overflow-auto rounded-md border bg-popover shadow-lg z-40">
          {!hasResults && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches for "{query}"
            </div>
          )}

          {data?.boards.length ? (
            <div className="py-1">
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">Boards</div>
              {data.boards.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    navigate(`/b/${b.id}`);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
                  )}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: b.color }}
                  />
                  <Hash className="size-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{b.name}</span>
                </button>
              ))}
            </div>
          ) : null}

          {data?.cards.length ? (
            <div className="border-t py-1">
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">Cards</div>
              {data.cards.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    navigate(`/b/${c.boardId}?card=${c.id}`);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <ClipboardList className="size-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{c.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.boardName} · {c.listName}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
