import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useSession } from "./lib/auth-client";
import LoginPage from "./pages/login";
import SignupPage from "./pages/signup";
import MagicLinkPage from "./pages/magic-link";
import DashboardPage from "./pages/dashboard";
import BoardPage from "./pages/board";
import CalendarPage from "./pages/calendar";
import SearchPage from "./pages/search";
import InvitePage from "./pages/invite";
import NotFoundPage from "./pages/not-found";
import { AppShell } from "./components/app-shell";
import { Loader2 } from "lucide-react";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  const location = useLocation();
  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data?.user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/magic-link" element={<MagicLinkPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/b/:boardId"
        element={
          <RequireAuth>
            <BoardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/calendar"
        element={
          <RequireAuth>
            <CalendarPage />
          </RequireAuth>
        }
      />
      <Route
        path="/search"
        element={
          <RequireAuth>
            <SearchPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
