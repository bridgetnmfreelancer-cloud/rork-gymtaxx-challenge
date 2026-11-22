import { useQuery } from "@tanstack/react-query";
import { Dumbbell } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { isPaymentsOpen } from "@/lib/lock";

/** The operator's own screens, which stay reachable while the site is paused. */
const OPERATOR_PATHS = ["/review", "/stats"];

/**
 * The site's pause lock.
 *
 * While `app_config.payments_enabled` is 'off', every route shows a short
 * closed screen instead of the app — the whole funnel, the paywall and the
 * member screens included, so nothing about a paused product implies it is
 * still taking people on. Flipping the row back to 'on' brings the site back
 * exactly as it was; no code changes in either direction.
 *
 * The operator's screens (/review, /stats) are exempt, so the pause itself
 * can still be supervised.
 */
export function ClosedGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { data: isOpen, isLoading } = useQuery({
    queryKey: ["payments-open"],
    queryFn: isPaymentsOpen,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const isOperator = OPERATOR_PATHS.some((path) => location.pathname.startsWith(path));
  if (isLoading || isOpen || isOperator) return <>{children}</>;
  return <ClosedScreen />;
}

function ClosedScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card" aria-hidden="true">
        <Dumbbell className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="mt-8 text-3xl font-extrabold tracking-[-0.02em] text-foreground">GymTaxx is paused</h1>
      <p className="mt-4 max-w-[32ch] text-base leading-relaxed text-muted-foreground">
        We're not taking new challenges right now. If your deposit is on its way back to you, it's already been sent —
        nothing is lost.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">Check back soon.</p>
    </div>
  );
}
