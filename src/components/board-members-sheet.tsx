import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, X } from "lucide-react";
import { api, type Member } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
import { toast } from "sonner";

interface InviteRow {
  id: string;
  email: string;
  role: string;
  createdAt: number;
}

export function BoardMembersSheet({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["members", boardId],
    queryFn: () => api.get<{ members: Member[]; invites: InviteRow[] }>(`/api/members/${boardId}`),
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");

  const invite = useMutation({
    mutationFn: () =>
      api.post<{ ok: true; addedDirectly?: boolean; inviteUrl?: string }>(
        "/api/members/invite",
        { boardId, email, role },
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["members", boardId] });
      setEmail("");
      toast.success(res.addedDirectly ? "User added to board" : "Invite email sent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/members/${boardId}/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", boardId] }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Board members</DialogTitle>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email) invite.mutate();
          }}
        >
          <Input
            type="email"
            placeholder="Invite by email..."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="flex-1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="rounded-md border bg-background px-2 text-sm"
          >
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
          <Button type="submit" disabled={!email || invite.isPending}>
            <Mail className="size-4" />
            Invite
          </Button>
        </form>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground">Members</div>
          {data?.members.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 p-2 rounded hover:bg-accent/40">
              <Avatar>
                {m.image && <AvatarImage src={m.image} alt={m.name} />}
                <AvatarFallback>{initials(m.name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.name}</div>
                <div className="text-xs text-muted-foreground truncate">{m.email}</div>
              </div>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {m.role}
              </span>
              {m.role !== "owner" && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove.mutate(m.userId)}
                  aria-label="Remove member"
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ))}

          {!!data?.invites.length && (
            <>
              <div className="pt-2 text-xs font-semibold text-muted-foreground">Pending invites</div>
              {data.invites.map((i) => (
                <div key={i.id} className="flex items-center gap-3 p-2 rounded">
                  <Mail className="size-4 text-muted-foreground" />
                  <div className="flex-1 text-sm">{i.email}</div>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {i.role}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
