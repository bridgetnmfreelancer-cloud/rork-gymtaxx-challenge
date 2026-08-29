import { Bell, BellOff, Check, Loader2, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { flowProgress } from "@/lib/flow";
import { registerForReminders } from "@/lib/push";
import { canUsePush, isIOS, isStandalone } from "@/lib/pwa";

/** What the browser will actually do if we ask right now. */
type PermissionState = "unsupported" | "askable" | "granted" | "denied";

function readPermission(): PermissionState {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  const current = Notification.permission;
  if (current === "granted") return "granted";
  if (current === "denied") return "denied";
  return "askable";
}

/**
 * The reminder ask, sitting immediately after the four-week comparison.
 *
 * Position is deliberate. It lands on the seam where the questions finish and
 * the commitment begins, so it interrupts nothing: everything from here to the
 * paywall is one unbroken run at the decision. Asking at install would spend
 * the prompt on people who hadn't yet seen what they'd be reminded about;
 * asking later would drop a system dialog into the middle of the sell.
 *
 * The permission is granted before an account exists, so the device cannot be
 * registered here. It gets attached at sign-up a few screens later, and
 * PushSync re-attaches it on every launch after that, so nothing is lost.
 *
 * Asking in plain words first means a reflexive "no" hits our screen rather
 * than the permission prompt — the browser only ever asks once, so spending
 * that single prompt on an unprepared user wastes it permanently.
 *
 * There's deliberately no "not right now" here. The iPhone's own prompt already
 * carries Don't Allow, so a second decline of our own only offered two ways to
 * say no. Refusing at that prompt still moves them on, so nobody is trapped.
 *
 * The screen reads the current permission rather than assuming it can be asked.
 * That single-prompt rule cuts both ways: once someone has answered — including
 * anyone who answered during an earlier visit — `requestPermission()` returns
 * instantly and silently, so a button promising a prompt would appear to do
 * nothing at all. Each of the three states now says something true instead.
 */
export default function Reminders() {
  const navigate = useNavigate();
  const [isAsking, setIsAsking] = useState<boolean>(false);
  const [permission, setPermission] = useState<PermissionState>(() => (canUsePush() ? readPermission() : "unsupported"));

  const browserOnly = isIOS() && !isStandalone();

  // Left in the history rather than replacing it, so the back button on the
  // challenge builder returns here instead of skipping the screen. Coming back
  // is harmless: the ask below reads the permission it can see and says
  // something true about it, including "already on".
  const goOn = useCallback((): void => {
    navigate("/challenge");
  }, [navigate]);

  /**
   * Re-read on return from Settings.
   *
   * Someone sent to iOS Settings to switch notifications on comes back to a
   * screen that was rendered while they were still denied. iOS doesn't reload
   * the page, so without this the screen keeps insisting they're blocked.
   */
  useEffect(() => {
    function refresh(): void {
      if (document.visibilityState === "visible" && canUsePush()) setPermission(readPermission());
    }
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  /** Register in the background — the result belongs on Account, not here. */
  const registerQuietly = useCallback((): void => {
    void registerForReminders().catch((error: unknown) => {
      console.error("reminders: background registration failed", error);
    });
  }, []);

  /**
   * Ask, then move on immediately.
   *
   * Only the permission prompt needs the user present. Registering the device
   * afterwards is a network round trip they gain nothing from watching, and on
   * iOS it can take several seconds — long enough that the screen read as
   * broken. So the moment they answer, they advance; registration finishes
   * behind them, and Account is where its result gets confirmed.
   *
   * The prompt is requested before any state is touched. iOS only honours this
   * call while it can still see the tap that caused it, and anything done first
   * risks spending that tap elsewhere.
   */
  function requestPermission(): void {
    if (isAsking) return;

    let pending: Promise<NotificationPermission>;
    try {
      pending = Notification.requestPermission();
    } catch (error) {
      // A refusal, or an older callback-only API, must never dead-end the funnel.
      console.error("reminders: permission request failed", error);
      goOn();
      return;
    }

    setIsAsking(true);
    pending
      .then((result) => {
        if (result === "granted") registerQuietly();
        else console.warn(`reminders: permission ${result}`);
      })
      .catch((error: unknown) => {
        console.error("reminders: permission request failed", error);
      })
      .finally(() => {
        setIsAsking(false);
        goOn();
      });
  }

  function continueWithReminders(): void {
    registerQuietly();
    goOn();
  }

  return (
    <Screen>
      <StepProgress {...flowProgress("reminders")} onBack={() => navigate(-1)} />

      <div className="pt-10 animate-rise-in">
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
        <Notice icon={BellOff}>
          <span className="font-semibold text-foreground">Reminders need the Home Screen version.</span> iPhone only
          allows notifications once GymTaxx is installed. You can add it any time from Account.
        </Notice>
      ) : null}

      {permission === "granted" ? (
        <Notice icon={Check}>
          <span className="font-semibold text-foreground">Reminders are already on.</span> You said yes on this iPhone
          before, so there's nothing else to do. You can turn them off in Account.
        </Notice>
      ) : null}

      {permission === "denied" ? (
        <Notice icon={Settings}>
          <span className="font-semibold text-foreground">Notifications are switched off for GymTaxx.</span> iPhone only
          asks once, so it has to be changed by hand: open Settings, tap Notifications, find GymTaxx in the list, then
          turn on Allow Notifications.
        </Notice>
      ) : null}

      <ScreenActions>
        {permission === "askable" ? (
          <Button size="xl" className="w-full" onClick={requestPermission} disabled={isAsking}>
            {isAsking ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
            Remind me
          </Button>
        ) : (
          <Button size="xl" className="w-full" onClick={permission === "granted" ? continueWithReminders : goOn}>
            Continue
          </Button>
        )}
      </ScreenActions>
    </Screen>
  );
}

function Notice({ icon: Icon, children }: { icon: typeof Bell; children: React.ReactNode }) {
  return (
    <div className="mt-8 flex gap-3 rounded-lg border border-border bg-card p-4 animate-rise-in [animation-delay:80ms]">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
