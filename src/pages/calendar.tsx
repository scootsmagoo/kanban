import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, dateFromApiTimestamp } from "@/lib/utils";

interface CalCard {
  id: string;
  title: string;
  dueDate: number;
  completedAt: number | null;
  boardId: string;
  boardName: string;
  boardColor: string;
  listName: string;
}

export default function CalendarPage() {
  const [month, setMonth] = useState(new Date());
  const { data } = useQuery({
    queryKey: ["calendar"],
    queryFn: () => api.get<{ cards: CalCard[] }>("/api/search/calendar"),
  });

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const cardsByDay = useMemo(() => {
    const map = new Map<string, CalCard[]>();
    for (const c of data?.cards ?? []) {
      const key = format(dateFromApiTimestamp(c.dueDate) ?? new Date(0), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [data]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between border-b bg-card/60 backdrop-blur px-4 py-3">
        <h1 className="text-lg font-semibold">{format(month, "MMMM yyyy")}</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(new Date())}>
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto kanban-scroll">
        <div className="grid grid-cols-7 border-b sticky top-0 bg-background z-10">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="border-r last:border-r-0 px-2 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-fr min-h-full">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const cards = cardsByDay.get(key) ?? [];
            return (
              <div
                key={key}
                className={cn(
                  "border-r border-b last:border-r-0 p-1.5 min-h-28 relative",
                  !isSameMonth(day, month) && "bg-muted/30",
                )}
              >
                <div
                  className={cn(
                    "text-xs font-medium mb-1 inline-flex h-5 items-center justify-center rounded px-1.5",
                    isToday(day) && "bg-primary text-primary-foreground",
                    !isSameMonth(day, month) && "text-muted-foreground",
                  )}
                >
                  {format(day, "d")}
                </div>
                <div className="space-y-1">
                  {cards.map((c) => (
                    <Link
                      key={c.id}
                      to={`/b/${c.boardId}?card=${c.id}`}
                      className={cn(
                        "block truncate rounded px-1.5 py-0.5 text-xs font-medium hover:opacity-80",
                        c.completedAt && "line-through opacity-60",
                      )}
                      style={{
                        backgroundColor: c.boardColor + "30",
                        color: c.boardColor,
                      }}
                      title={`${c.title} — ${c.boardName} · ${c.listName}`}
                    >
                      {c.title}
                    </Link>
                  ))}
                </div>
                {void isSameDay /* keep import */}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
