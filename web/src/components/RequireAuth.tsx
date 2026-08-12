import { Loader2 } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { type ReactNode } from "react";

import { useAuth } from "@/context/AuthProvider";

/**
 * Gate for everything past the account screen.
 *
 * Waits for the stored session before deciding: an installed web app is
 * relaunched cold constantly, and redirecting during that first tick would
 * bounce signed-in people back to the welcome screen every morning.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/welcome" replace state={{ from: location.pathname }} />;

  return <>{children}</>;
}

export function FullScreenLoader() {
  return (
    <div className="flex min-h-full items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
