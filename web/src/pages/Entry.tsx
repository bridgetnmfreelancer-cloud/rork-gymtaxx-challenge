import { Navigate } from "react-router-dom";

import { FullScreenLoader } from "@/components/RequireAuth";
import { useAuth } from "@/context/AuthProvider";
import { isStandalone } from "@/lib/pwa";

/**
 * The front door at "/".
 *
 * Someone opening GymTaxx from their Home Screen should land in the app, not be
 * shown install instructions they've already followed. A first-time visitor
 * arriving from the marketing site gets the install page.
 *
 * The freshly installed case goes to the onboarding run rather than the account
 * screen: the whole point of the rebuild is that nobody is asked to identify
 * themselves until they've been through it.
 */
export default function Entry() {
  const { session, isLoading } = useAuth();

  if (isLoading) return <FullScreenLoader />;
  if (session) return <Navigate to="/home" replace />;
  if (isStandalone()) return <Navigate to="/onboarding" replace />;

  return <Navigate to="/install" replace />;
}
