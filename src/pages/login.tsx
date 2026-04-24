import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authClient, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const navigate = useNavigate();
  const { data } = useSession();

  if (data?.user) {
    navigate(next, { replace: true });
  }

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  async function passwordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading("password");
    const { error } = await authClient.signIn.email({
      email,
      password,
      callbackURL: next,
    });
    setLoading(null);
    if (error) toast.error(error.message ?? "Sign in failed");
    else navigate(next);
  }

  async function magicLinkSend() {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    setLoading("magic");
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: next,
    });
    setLoading(null);
    if (error) toast.error(error.message ?? "Failed to send magic link");
    else navigate("/magic-link?email=" + encodeURIComponent(email));
  }

  async function social(provider: "google" | "github") {
    setLoading(provider);
    await authClient.signIn.social({ provider, callbackURL: next });
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to keep your boards moving.">
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() => social("google")}
          disabled={loading !== null}
          type="button"
        >
          {loading === "google" ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
          Google
        </Button>
        <Button
          variant="outline"
          onClick={() => social("github")}
          disabled={loading !== null}
          type="button"
        >
          {loading === "github" ? <Loader2 className="size-4 animate-spin" /> : <GitHubIcon />}
          GitHub
        </Button>
      </div>

      <div className="relative my-4">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
          OR
        </span>
      </div>

      <form onSubmit={passwordSignIn} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading !== null}>
          {loading === "password" && <Loader2 className="size-4 animate-spin" />}
          Sign in
        </Button>
      </form>

      <Button
        variant="ghost"
        className="w-full mt-2"
        onClick={magicLinkSend}
        disabled={loading !== null}
      >
        {loading === "magic" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
        Email me a magic link
      </Button>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don't have an account?{" "}
        <Link to="/signup" className="text-primary font-medium hover:underline">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-sky-50 via-background to-sky-100 dark:from-sky-950/30 dark:via-background dark:to-slate-900 px-4">
      <Link to="/" className="mb-8 flex items-center gap-2 font-semibold text-lg">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">
          K
        </div>
        Kanban
      </Link>

      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-5 text-center">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.56-2.77c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.95l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
      <path d="M12 .3a12 12 0 0 0-3.79 23.4c.6.1.82-.26.82-.58v-2.05c-3.34.73-4.04-1.6-4.04-1.6-.55-1.4-1.34-1.78-1.34-1.78-1.1-.74.08-.73.08-.73 1.21.08 1.85 1.24 1.85 1.24 1.07 1.85 2.81 1.31 3.5 1 .1-.78.42-1.32.76-1.62-2.66-.3-5.46-1.33-5.46-5.93 0-1.31.47-2.38 1.24-3.22-.13-.31-.54-1.54.12-3.2 0 0 1.01-.32 3.3 1.23a11.4 11.4 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.89.12 3.2.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.21.69.83.57A12 12 0 0 0 12 .3" />
    </svg>
  );
}
