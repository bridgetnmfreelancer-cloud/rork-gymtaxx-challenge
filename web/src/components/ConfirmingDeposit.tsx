import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { BottomNav } from "@/components/BottomNav";
import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthProvider";
import { queryKeys } from "@/lib/queries";
import { SLOW_AFTER_MS } from "@/lib/settlement";

const SUPPORT_EMAIL = "support@gymtaxx.com";

/**
 * Shown between the card being charged and the server confirming it.
 *
 * The card has already been charged by the time this appears, so the copy says so
 * outright. Anything vaguer reads as "your payment may have failed" to someone who
 * has just paid, and that is exactly the moment trust is easiest to lose.
 *
 * The participation query polls on its own while a deposit is settling, so this
 * screen replaces itself as soon as the confirmation lands — the button is there
 * for reassurance, not because anything depends on it.
 */
export function ConfirmingDeposit({
  since,
  withNav = false,
}: {
  since: number;
  withNav?: boolean;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [isSlow, setIsSlow] = useState<boolean>(() => Date.now() - since >= SLOW_AFTER_MS);

  useEffect(() => {
    if (isSlow) return;
    // Elapsed time is measured from when the payment was submitted, not from
    // when this mounted, so a 3-D Secure detour or an app restart doesn't reset
    // the clock and hide a genuinely slow confirmation.
    const remaining = SLOW_AFTER_MS - (Date.now() - since);
    const timer = setTimeout(() => setIsSlow(true), Math.max(remaining, 0));
    return () => clearTimeout(timer);
  }, [isSlow, since]);

  return (
    <Screen withNav={withNav}>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <Loader2 className="absolute h-24 w-24 animate-spin text-accent" strokeWidth={1.5} aria-hidden="true" />
          <ShieldCheck className="h-10 w-10 text-foreground" aria-hidden="true" />
        </div>

        <ScreenTitle className="mt-8">
          {isSlow ? "Still confirming." : "Confirming your deposit."}
        </ScreenTitle>

        <ScreenSubtitle>
          {isSlow
            ? "Your payment has gone through and your deposit is safe. The confirmation is taking longer than usual to reach us. This screen updates on its own as soon as it lands."
            : "Your payment has gone through. We're waiting on the confirmation, which usually takes a few seconds."}
        </ScreenSubtitle>

        {isSlow ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Still here in a minute or two?{" "}
            <a className="font-medium text-foreground underline underline-offset-4" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          </p>
        ) : null}
      </div>

      {isSlow ? (
        <ScreenActions>
          <Button
            variant="outline"
            size="xl"
            className="w-full"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: queryKeys.participation(user?.id) });
            }}
          >
            Check again
          </Button>
        </ScreenActions>
      ) : null}

      {withNav ? <BottomNav /> : null}
    </Screen>
  );
}
