import { Bell, BellOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import { registerForReminders } from "@/lib/push";
import { canUsePush, isIOS, isStandalone } from "@/lib/pwa";

/**
 * Step 4 of the funnel: our own ask, before the browser's.
 *
 * Asking in plain words first means a reflexive "no" hits our screen rather
 * than the permission prompt — the browser only ever asks once, so spending
 * that single prompt on an unprepared user wastes it permanently.
 *
 * There's deliberately no "not right now" here. The iPhone's own prompt already
 * carries Don't Allow, so a second decline of our own only offered two ways to
 * say no. Refusing at that prompt still moves them on, so nobody is trapped.
 */
export default function Reminders() {
  const navigate = useNavigate();
  const [isAsking, setIsAsking] = useState<boolean>(false);

  const pushAvailable = canUsePush();
  const browserOnly = isIOS() && !isStandalone();

  function goOn(): void {
    navigate("/onboarding", { replace: true });
  }

  /**
   * Ask, then move on immediately.
   *
   * Only the permission prompt needs the user present. Registering the device
   * afterwards is a network round trip they gain nothing from watching, and on
   * iOS it can take several seconds — long enough that the screen read as
   * broken. So the moment they answer, they advance; registration finishes
   * behind them, and Account is where its result gets confirmed.
   */
  async function requestPermission(): Promise<void> {
    if (isAsking) return;
    setIsAsking(true);
    try {
      const result = await Notification.requestPermission();
      if (result === "granted") {
        // Deliberately not awaited — see above.
        void registerForReminders().catch((error: unknown) => {
          console.error("reminders: background registration failed", error);
        });
      } else {
        console.warn("reminders: permission not granted");
      }
    } catch (error) {
      // A refusal must never dead-end the funnel.
      console.error("reminders: permission request failed", error);
    } finally {
      setIsAsking(false);
      goOn();
    }
  }

  return (
    <Screen>
      <div className="pt-16 animate-rise-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-accent">
          <Bell className="h-8 w-8 text-success-ink" aria-hidden="true" />
        </div>
        <ScreenTitle className="mt-8">Never forget a workout</ScreenTitle>
        <ScreenSubtitle>
          We will remind you to go to the gym when you don't hit your target; before you run out of time and lose your
          money.
        </ScreenSubtitle>
      </div>

      {browserOnly ? (
        <div className="mt-8 flex gap-3 rounded-lg border border-border bg-card p-4 animate-rise-in [animation-delay:80ms]">
          <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Reminders need the Home Screen version.</span> iPhone only
            allows notifications once GymTaxx is installed. You can add it any time from Account.
          </p>
        </div>
      ) : null}

      <ScreenActions>
        {pushAvailable ? (
          <Button size="xl" className="w-full" onClick={requestPermission} disabled={isAsking}>
            {isAsking ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
            Remind me
          </Button>
        ) : (
          <Button size="xl" className="w-full" onClick={goOn}>
            Continue
          </Button>
        )}
      </ScreenActions>
    </Screen>
  );
}
