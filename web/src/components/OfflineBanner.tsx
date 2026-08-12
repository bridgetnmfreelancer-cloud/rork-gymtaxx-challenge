import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * A thin bar that appears when the connection drops.
 *
 * Gyms are famously bad for signal, and someone about to submit proof needs to
 * know *before* they take the photo that it won't send.
 */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState<boolean>(() => typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const goOnline = (): void => setIsOffline(false);
    const goOffline = (): void => setIsOffline(true);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      <span>No connection — you can look, but not submit</span>
    </div>
  );
}
