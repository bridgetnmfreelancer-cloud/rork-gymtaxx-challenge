import { useEffect } from "react";

import { useAuth } from "@/context/AuthProvider";
import { syncRemindersIfAllowed } from "@/lib/push";

/**
 * Keeps this device's reminder registration alive.
 *
 * Renders nothing. It exists because the only places that ever registered a
 * device were the sign-up reminders screen and the Account switch — so a
 * returning user whose registration had been dropped could never get it back,
 * silently, while their permission still read as granted.
 *
 * Runs once per signed-in account rather than on every navigation, and does
 * nothing at all unless permission has already been given. It never prompts.
 */
export function PushSync() {
  const { session } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    void syncRemindersIfAllowed();
  }, [userId]);

  return null;
}
