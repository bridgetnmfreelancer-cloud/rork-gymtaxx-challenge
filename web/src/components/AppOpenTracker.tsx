import { useEffect } from "react";

import { useAuth } from "@/context/AuthProvider";
import { recordAppOpen } from "@/lib/telemetry";

/**
 * Notes that this account opened the app, and whether it came from the home
 * screen.
 *
 * Renders nothing. Runs once per signed-in account per app load rather than on
 * every navigation, so it costs one tiny write per session.
 */
export function AppOpenTracker() {
  const { session } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    void recordAppOpen();
  }, [userId]);

  return null;
}
