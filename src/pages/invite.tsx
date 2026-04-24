import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { AuthShell } from "./login";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { data, isPending } = useSession();
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPending || !data?.user || !token) return;
    setAccepting(true);
    api
      .post<{ ok: true; boardId: string }>(`/api/members/invite/${token}/accept`)
      .then((res) => navigate(`/b/${res.boardId}`, { replace: true }))
      .catch((e) => setError(e.message))
      .finally(() => setAccepting(false));
  }, [isPending, data, token, navigate]);

  if (!isPending && !data?.user) {
    return (
      <AuthShell title="You're invited" subtitle="Sign in or create an account to accept.">
        <div className="grid grid-cols-2 gap-2">
          <Button asChild>
            <Link to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/signup?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign up</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Joining board…">
      <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
        {accepting || isPending ? (
          <>
            <Loader2 className="size-6 animate-spin text-primary" />
            <p>Hold tight while we add you to the board.</p>
          </>
        ) : error ? (
          <>
            <p className="text-destructive">{error}</p>
            <Button asChild variant="outline">
              <Link to="/">Back to dashboard</Link>
            </Button>
          </>
        ) : null}
      </div>
    </AuthShell>
  );
}
