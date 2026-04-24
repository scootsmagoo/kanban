import { useSearchParams, Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { AuthShell } from "./login";
import { Button } from "@/components/ui/button";

export default function MagicLinkPage() {
  const [params] = useSearchParams();
  const email = params.get("email");
  return (
    <AuthShell title="Check your email">
      <div className="flex flex-col items-center text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Mail className="size-6" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          We sent a sign-in link to{" "}
          <span className="font-medium text-foreground">{email ?? "your inbox"}</span>. Click the link
          to continue.
        </p>
        <Button asChild variant="outline" className="mt-6 w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
