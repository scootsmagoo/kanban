import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Hash } from "lucide-react";
import { api, type Board } from "@/lib/api";

interface Result {
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

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const { data, isLoading } = useQuery({
    queryKey: ["search-page", q],
    queryFn: () => api.get<Result>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: !!q,
  });

  return (
    <div className="h-full overflow-auto kanban-scroll">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-xl font-semibold">Search</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Results for <span className="font-medium text-foreground">{q || "—"}</span>
        </p>

        {isLoading && <p className="mt-8 text-muted-foreground">Searching...</p>}

        {data && (
          <div className="mt-8 space-y-8">
            {data.boards.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">Boards</h2>
                <div className="space-y-1">
                  {data.boards.map((b) => (
                    <Link
                      key={b.id}
                      to={`/b/${b.id}`}
                      className="flex items-center gap-2 rounded px-2 py-2 hover:bg-accent"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: b.color }}
                      />
                      <Hash className="size-4 text-muted-foreground" />
                      <span>{b.name}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {data.cards.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">Cards</h2>
                <div className="space-y-1">
                  {data.cards.map((c) => (
                    <Link
                      key={c.id}
                      to={`/b/${c.boardId}?card=${c.id}`}
                      className="flex items-start gap-2 rounded p-2 hover:bg-accent"
                    >
                      <ClipboardList className="size-4 mt-1 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{c.title}</div>
                        {c.description && (
                          <div className="text-sm text-muted-foreground line-clamp-2">
                            {c.description}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          {c.boardName} · {c.listName}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {data.boards.length === 0 && data.cards.length === 0 && q && (
              <p className="text-muted-foreground">No matches.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
