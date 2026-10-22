import { Navigate } from "react-router-dom";

import { FullScreenLoader } from "@/components/RequireAuth";
import { useAuth } from "@/context/AuthProvider";

/**
 * The front door at "/".
 *
 * Someone opening GymTaxx from their Home Screen should land in the app, not be
 * shown install instructions they've already followed. Since 22 Oct 2026 a
 * first-time browser visitor goes straight to the onboarding questions — the
 * install steps wait until after signup, where they belong.
 *
 * The freshly installed case goes to the onboarding run rather than the account
 * screen: the whole point of the rebuild is that nobody is asked to identify
 * themselves until they've been through it.
 */
export default function Entry() {
  const { session, isLoading } = useAuth();

  if (isLoading) return <FullScreenLoader />;
  if (session) return <Navigate to="/home" replace />;
  return <Navigate to="/onboarding" replace />;
}
