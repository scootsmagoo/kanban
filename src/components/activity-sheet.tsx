import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { api, type ActivityRow } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";

export function ActivitySheet({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["activity", boardId],
    queryFn: () => api.get<{ activity: ActivityRow[] }>(`/api/activity/board/${boardId}`),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activity</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {data?.activity.map((a) => (
            <div key={a.id} className="flex gap-2.5 text-sm">
              <Avatar className="size-7">
                {a.actorImage && <AvatarImage src={a.actorImage} alt={a.actorName} />}
                <AvatarFallback>{initials(a.actorName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div>
                  <span className="font-medium">{a.actorName}</span>{" "}
                  <span className="text-muted-foreground">{describe(a)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(a.createdAt * 1000), { addSuffix: true })}
                </div>
              </div>
            </div>
          ))}
          {data?.activity.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No activity yet</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function describe(a: ActivityRow): string {
  const d = a.data as Record<string, string | number>;
  switch (a.type) {
    case "board.created":
      return `created the board "${d.name}"`;
    case "board.updated":
      return "updated board settings";
    case "list.created":
      return `added list "${d.name}"`;
    case "list.renamed":
      return `renamed list "${d.from}" → "${d.to}"`;
    case "list.archived":
      return `archived list "${d.name}"`;
    case "list.moved":
      return `moved list "${d.name}"`;
    case "card.created":
      return `added card "${d.title}" to ${d.listName}`;
    case "card.renamed":
      return `renamed "${d.from}" → "${d.to}"`;
    case "card.described":
      return `updated description of "${d.title}"`;
    case "card.moved":
      return `moved "${d.title}" from ${d.fromList} → ${d.toList}`;
    case "card.archived":
      return `archived "${d.title}"`;
    case "card.due_set":
      return `set a due date on "${d.title}"`;
    case "card.due_cleared":
      return `removed the due date on "${d.title}"`;
    case "card.completed":
      return `marked "${d.title}" complete`;
    case "card.uncompleted":
      return `marked "${d.title}" incomplete`;
    case "card.assigned":
      return `assigned a member to "${d.title}"`;
    case "card.unassigned":
      return `unassigned a member from "${d.title}"`;
    case "card.labeled":
      return `added a label to "${d.title}"`;
    case "card.unlabeled":
      return `removed a label from "${d.title}"`;
    case "comment.added":
      return `commented on "${d.cardTitle}": "${d.preview}"`;
    case "comment.deleted":
      return `deleted a comment on "${d.cardTitle}"`;
    case "checklist.added":
      return `added a checklist to "${d.cardTitle}"`;
    case "checklist.item.toggled":
      return `${d.completed ? "checked" : "unchecked"} "${d.item}" on "${d.cardTitle}"`;
    case "attachment.added":
      return `attached ${d.filename} to "${d.cardTitle}"`;
    case "attachment.deleted":
      return `removed attachment ${d.filename}`;
    case "member.invited":
      return `invited ${d.email} as ${d.role}`;
    case "member.joined":
      return `joined the board`;
    case "member.removed":
      return `removed a member`;
    default:
      return a.type;
  }
}
