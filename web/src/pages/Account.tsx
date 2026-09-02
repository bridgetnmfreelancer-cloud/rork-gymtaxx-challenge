import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronRight,
  CreditCard,
  FileText,
  FlaskConical,
  LifeBuoy,
  Loader2,
  LogOut,
  Send,
  Share,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { BottomNav } from "@/components/BottomNav";
import { Screen, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/context/AuthProvider";
import type { CurrencyCode } from "@/lib/money";
import type { ProfileRow } from "@/lib/database.types";
import { formatStartDate } from "@/lib/gymweek";
import { CHALLENGE_WEEKS, currencyFrom, depositFor, formatMoney } from "@/lib/money";
import {
  hasActiveReminders,
  isRegisteredOnServer,
  registerForRemindersDetailed,
  unregisterReminders,
} from "@/lib/push";
import { canUsePush, isIOS, isStandalone } from "@/lib/pwa";
import { formatFee, intervalSuffix, isPlanId, planById } from "@/lib/plans";
import { queryKeys, useCurrentChallenge, useParticipation, useProfile } from "@/lib/queries";
import { callFunction } from "@/lib/supabase";

const SUPPORT_EMAIL = "support@gymtaxx.com";

/** Shown only when registration fails without naming a cause. */
const REMINDER_FALLBACK_ERROR = "Turning reminders on failed. Try again in a moment.";

/**
 * Operator accounts, for showing the test controls only.
 *
 * This is a display hint, never a permission. Every operator action is checked
 * again on the server against its own allowlist, so putting an address here
 * grants nothing — it only decides whether the buttons are drawn. Kept local so
 * the controls appear even when the server check is unreachable, which is
 * exactly when they are most needed.
 */
const OPERATOR_EMAILS: readonly string[] = ["support@gymtaxx.com"];
const TERMS_URL = "https://www.gymtaxx.com/terms";
const PRIVACY_URL = "https://www.gymtaxx.com/privacy";
const SUPPORT_URL = "https://www.gymtaxx.com/support";

type TestState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; message: string }
  | { kind: "error"; message: string };

/**
 * The two conversion events a new challenge can produce. Testable separately
 * because only StartTrial carries a value of zero, which is the difference under
 * investigation.
 */
type CapiTestEvent = "Purchase" | "StartTrial";

export default function Account() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();
  const { data: participation } = useParticipation();
  const { data: challenge } = useCurrentChallenge();
  const { data: profile } = useProfile();

  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [testState, setTestState] = useState<TestState>({ kind: "idle" });
  const [isTestActivating, setIsTestActivating] = useState<boolean>(false);
  const [capiState, setCapiState] = useState<TestState>({ kind: "idle" });
  /** Which conversion test is in flight, so only that button shows a spinner. */
  const [capiSending, setCapiSending] = useState<CapiTestEvent | null>(null);

  /**
   * Operator check. The endpoint 404s for everyone else, so a failed query
   * simply means "not an operator" and the extra controls stay hidden.
   */
  const { data: adminInfo } = useQuery({
    queryKey: ["whoami"],
    queryFn: () => callFunction<{ isAdmin: boolean }>("review-workouts", { action: "whoami" }),
    retry: 0,
    staleTime: 5 * 60_000,
  });
  const isAdmin =
    adminInfo?.isAdmin === true || OPERATOR_EMAILS.includes((user?.email ?? "").trim().toLowerCase());

  const currency = currencyFrom(participation?.currency);
  const weeks = challenge?.number_of_weeks ?? CHALLENGE_WEEKS;
  const locale = currency === "gbp" ? "en-GB" : "en-US";

  const startLabel = useMemo(() => {
    if (!participation) return null;
    return formatStartDate(new Date(participation.started_at), participation.time_zone, locale);
  }, [participation, locale]);

  const notInstalled = isIOS() && !isStandalone();
  const pushAvailable = canUsePush();
  /**
   * The test is the only thing that proves delivery end to end, so it stays
   * reachable whenever this phone *could* receive one. Gating it on the switch
   * hid it in exactly the case worth investigating: permission granted, but the
   * device never made it onto our list.
   */
  const canTestReminders =
    pushAvailable && typeof Notification !== "undefined" && Notification.permission === "granted";
  const [remindersOn, setRemindersOn] = useState<boolean>(false);
  const [isTogglingReminders, setIsTogglingReminders] = useState<boolean>(false);
  const [pushError, setPushError] = useState<string | null>(null);

  /**
   * Reconcile what the browser thinks with what the server actually has.
   *
   * These can disagree, and when they do the switch reads "on" while nothing we
   * send can arrive — the silent failure that made a missing reminder look like
   * a delivery problem. Repairing it here is safe: re-saving the same device
   * overwrites its own record, so it cannot cause a duplicate notification.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const active = await hasActiveReminders();
      if (cancelled) return;
      setRemindersOn(active);
      if (!active) return;

      if (await isRegisteredOnServer()) return;
      if (cancelled) return;

      const result = await registerForRemindersDetailed();
      if (cancelled) return;
      if (!result.ok) setPushError(result.reason ?? REMINDER_FALLBACK_ERROR);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleReminders = useCallback(async (next: boolean): Promise<void> => {
    setIsTogglingReminders(true);
    setPushError(null);
    try {
      if (!next) {
        await unregisterReminders();
        setRemindersOn(false);
        return;
      }

      // The browser only ever asks once; if they said no previously this
      // returns "denied" without a prompt, so the switch must stay off.
      const permission =
        Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        setRemindersOn(false);
        return;
      }

      const result = await registerForRemindersDetailed();
      setRemindersOn(result.ok);
      if (!result.ok) setPushError(result.reason ?? REMINDER_FALLBACK_ERROR);
    } catch (error) {
      console.error("account: reminder toggle failed", error);
      setRemindersOn(false);
      setPushError(REMINDER_FALLBACK_ERROR);
    } finally {
      setIsTogglingReminders(false);
    }
  }, []);

  /**
   * Prove reminders reach this phone, without waiting for an evening.
   *
   * The scheduled sender only fires between 17:00 and 20:00 local time on
   * certain days, so "did that work?" was otherwise unanswerable for hours.
   */
  async function sendTestNotification(): Promise<void> {
    setTestState({ kind: "sending" });
    try {
      const result = await callFunction<{ devices: number; delivered: number }>("send-test-notification");

      if (result.devices === 0) {
        setTestState({
          kind: "error",
          message:
            "We have no device on file for this account, so there was nothing to send to. Turn the switch off, then on again, and read any message that appears underneath it.",
        });
        return;
      }
      if (result.delivered === 0) {
        setTestState({
          kind: "error",
          message: "Your phone was registered but rejected the notification. Turn the switch off and on to re-register.",
        });
        return;
      }

      setTestState({
        kind: "sent",
        message:
          result.devices > 1
            ? `Sent to ${result.delivered} of your ${result.devices} devices. It should appear in a few seconds.`
            : "Sent. It should appear in a few seconds — close the app to see it arrive.",
      });
    } catch (caught) {
      console.error("account: test notification failed", caught);
      setTestState({ kind: "error", message: "We couldn't send it just then. Check your connection and try again." });
    }
  }

  /**
   * Operator-only, temporary: check the Meta purchase reporting is wired up.
   *
   * Stripe is on live keys, so proving this through a genuine deposit would mean a
   * real charge and a manual refund. This sends one event through the same server
   * code the Stripe webhook uses, without touching any payment or challenge.
   */
  async function runCapiTest(event: CapiTestEvent): Promise<void> {
    setCapiSending(event);
    setCapiState({ kind: "sending" });
    try {
      const result = await callFunction<{
        eventName: string;
        result: {
          sent: boolean;
          reason?: string;
          detail?: string;
          eventsReceived?: number;
          messages?: string[];
          fbTraceId?: string;
        };
        mode: string;
        configuredTestCode: string | null;
        tokenConfigured: boolean;
      }>("test-capi-purchase", { event });

      if (!result.tokenConfigured) {
        setCapiState({ kind: "error", message: "No access token on the server yet." });
        return;
      }
      if (!result.result.sent) {
        setCapiState({
          kind: "error",
          message: `Meta rejected ${event}: ${result.result.reason ?? "unknown"}. ${result.result.detail ?? ""}`.trim(),
        });
        return;
      }

      // Meta answers 200 even for an event it has taken but won't report on, so
      // its own count and warnings are the only trustworthy confirmation.
      const accepted = result.result.eventsReceived;
      const warnings = result.result.messages ?? [];
      const countNote =
        typeof accepted === "number" ? ` Meta counted ${accepted} event(s).` : "";
      const warningNote =
        warnings.length > 0 ? ` Meta warned: ${warnings.join(" | ")}` : "";
      // Test codes rotate. Showing the one actually used turns a stale code from
      // an invisible failure into something you can spot at a glance.
      const placeNote =
        result.mode === "test_events"
          ? `Sent to Test events using code ${result.configuredTestCode ?? "none"} - check that matches the code shown in Events Manager.`
          : "Sent to LIVE reporting, exactly as the Stripe webhook sends it. Check the Overview event list, not Test events.";

      // Meta's own request id. It is the only handle their support team can
      // trace, so it belongs on screen rather than buried in server logs.
      const traceNote = result.result.fbTraceId
        ? ` Meta trace id: ${result.result.fbTraceId}`
        : "";

      setCapiState({
        kind: accepted === 0 || warnings.length > 0 ? "error" : "sent",
        message: `${event} accepted.${countNote}${warningNote} ${placeNote}${traceNote}`.trim(),
      });
    } catch (caught) {
      console.error("account: capi test failed", caught);
      setCapiState({ kind: "error", message: "Couldn't reach the server just then." });
    } finally {
      setCapiSending(null);
    }
  }

  /** Operator-only: open or close the challenge without a real charge. */
  async function toggleTestMode(activate: boolean): Promise<void> {
    setIsTestActivating(true);
    try {
      await callFunction<{ status: string }>("review-workouts", {
        action: activate ? "test_activate" : "test_reset",
      });
      await queryClient.invalidateQueries();
      navigate(activate ? "/home" : "/account", { replace: true });
    } catch (caught) {
      console.error("account: test mode toggle failed", caught);
    } finally {
      setIsTestActivating(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (isDeleting) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await callFunction<{ status: string }>("delete-account");
      await signOut();
      queryClient.clear();
      navigate("/welcome", { replace: true });
    } catch (caught) {
      console.error("account: delete failed", caught);
      setDeleteError("We couldn't delete your account just then. Email us and we'll do it by hand.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Screen withNav>
      <header className="py-4">
        <ScreenTitle className="text-title">Account</ScreenTitle>
        <p className="mt-1 truncate text-sm text-muted-foreground">{user?.email ?? ""}</p>
      </header>

      {participation ? (
        <section className="divide-y divide-border overflow-hidden rounded-lg bg-card">
          <InfoRow
            icon={Target}
            label="Weekly goal"
            value={`${participation.goal_workouts_per_week} workouts a week`}
          />
          {startLabel ? <InfoRow icon={FileText} label="Started" value={startLabel} /> : null}
          <InfoRow
            icon={CreditCard}
            label="Commitment"
            value={`${formatMoney(depositFor(participation.goal_workouts_per_week, weeks), currency)} ${
              participation.payment_status === "paid" ? "held" : "not yet paid"
            }`}
          />
        </section>
      ) : (
        <section className="rounded-lg bg-card p-5">
          <p className="font-semibold text-foreground">No active challenge</p>
          <p className="mt-1 text-sm text-muted-foreground">Build one whenever you're ready to commit.</p>
          <Button className="mt-4 w-full" onClick={() => navigate("/challenge")}>
            Build my challenge
          </Button>
        </section>
      )}

      <MembershipSection profile={profile ?? null} currency={currency} />

      {notInstalled ? (
        <section className="mt-4 flex items-start gap-3 rounded-lg border border-border p-4">
          <Share className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold leading-tight text-foreground">Add GymTaxx to your Home Screen</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Reminders only work once it's installed. Tap Share, then "Add to Home Screen".
            </p>
          </div>
        </section>
      ) : (
        <section className="mt-4 rounded-lg bg-card px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-foreground" aria-hidden="true" />
              <span className="font-medium text-foreground">Reminders</span>
            </div>
            <Switch
              checked={remindersOn}
              disabled={!pushAvailable || isTogglingReminders}
              onCheckedChange={(next) => {
                void toggleReminders(next);
              }}
              aria-label="Reminders"
            />
          </div>
          {pushAvailable && !remindersOn && typeof Notification !== "undefined" && Notification.permission === "denied" ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your browser is blocking notifications. Turn them back on in Settings, then flip this switch.
            </p>
          ) : null}

          {pushError ? (
            <p role="status" className="mt-2 text-sm leading-relaxed text-danger-ink">
              {pushError}
            </p>
          ) : null}

          {canTestReminders ? (
            <>
              <button
                type="button"
                onClick={() => void sendTestNotification()}
                disabled={testState.kind === "sending"}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                {testState.kind === "sending" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                Send me a test reminder
              </button>
              {testState.kind === "sent" || testState.kind === "error" ? (
                <p
                  role="status"
                  className={`mt-2 text-sm leading-relaxed ${
                    testState.kind === "sent" ? "text-success-ink" : "text-danger-ink"
                  }`}
                >
                  {testState.message}
                </p>
              ) : null}
            </>
          ) : null}
        </section>
      )}

      {isAdmin ? (
        <section className="mt-4 rounded-lg border border-dashed border-border p-4">
          <div className="flex items-center gap-3">
            <FlaskConical className="h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
            <p className="font-semibold text-foreground">Test mode</p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {participation?.payment_status === "paid"
              ? "Your challenge is open. Close it to return to the payment screen."
              : "Open your challenge without paying, so you can test verifying a workout end to end. Only affects your own account."}
          </p>
          <Button
            variant="outline"
            className="mt-3 w-full"
            disabled={isTestActivating || !participation}
            onClick={() => void toggleTestMode(participation?.payment_status !== "paid")}
          >
            {isTestActivating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {participation?.payment_status === "paid" ? "Close my challenge" : "Open without paying"}
          </Button>
          {!participation ? (
            <p className="mt-2 text-sm text-muted-foreground">Build a challenge first, then come back here.</p>
          ) : null}
          <a
            href="/review"
            className="mt-3 flex items-center justify-between rounded-md py-2 text-sm font-medium text-foreground underline underline-offset-4"
          >
            Open review queue
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <Button
            variant="outline"
            className="mt-3 w-full"
            disabled={capiSending !== null}
            onClick={() => void runCapiTest("Purchase")}
          >
            {capiSending === "Purchase" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Test Meta purchase tracking
          </Button>
          <Button
            variant="outline"
            className="mt-2 w-full"
            disabled={capiSending !== null}
            onClick={() => void runCapiTest("StartTrial")}
          >
            {capiSending === "StartTrial" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Test Meta trial tracking
          </Button>
          {capiState.kind === "sent" || capiState.kind === "error" ? (
            <p
              className={`mt-2 text-sm leading-relaxed ${
                capiState.kind === "sent" ? "text-success-ink" : "text-danger-ink"
              }`}
            >
              {capiState.message}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="mt-4 divide-y divide-border overflow-hidden rounded-lg bg-card">
        <LinkRow icon={LifeBuoy} label="Help and support" href={SUPPORT_URL} />
        <LinkRow icon={FileText} label="Terms" href={TERMS_URL} />
        <LinkRow icon={ShieldCheck} label="Privacy" href={PRIVACY_URL} />
      </section>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Questions about a deposit or refund?{" "}
        <a className="font-medium text-foreground underline underline-offset-4" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
      </p>

      <div className="mt-8 space-y-3">
        <Button
          variant="outline"
          size="xl"
          className="w-full"
          onClick={() => {
            void signOut().then(() => {
              queryClient.clear();
              navigate("/welcome", { replace: true });
            });
          }}
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          Log out
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="w-full text-danger-ink hover:bg-destructive/10 hover:text-danger-ink">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes your account, your workout photos and your record, permanently. If you have a deposit held,
                email {SUPPORT_EMAIL} first — deleting won't return it automatically.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError ? <p className="text-sm font-medium text-danger-ink">{deleteError}</p> : null}
            <AlertDialogFooter>
              <AlertDialogCancel>Keep my account</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void handleDelete();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Delete permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <BottomNav />
    </Screen>
  );
}

/**
 * Membership: what they're on, when it renews, and how to stop it.
 *
 * Cancelling lives here rather than behind an email, because it has to be as
 * easy to leave as it was to join. It takes effect at the end of the period they
 * have already paid for, and it never interferes with a challenge in flight —
 * someone with a deposit riding on this week keeps verifying workouts either way.
 */
function MembershipSection({ profile, currency }: { profile: ProfileRow | null; currency: CurrencyCode }) {
  const queryClient = useQueryClient();
  const [isWorking, setIsWorking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const planId = isPlanId(profile?.plan) ? profile.plan : null;

  // Grandfathered accounts joined before access was charged for and keep those
  // terms. Showing them a plan row would invent a relationship that isn't there.
  if (!profile || profile.grandfathered === true || !planId) return null;

  const plan = planById(planId);
  const isRecurring = plan.interval !== "one_off";
  const status = profile.plan_status ?? "active";
  const cancelling = profile.plan_cancel_at_period_end === true;

  const renewLabel = profile.plan_renews_at
    ? new Date(profile.plan_renews_at).toLocaleDateString(currency === "gbp" ? "en-GB" : "en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  async function change(action: "cancel" | "resume"): Promise<void> {
    if (isWorking) return;
    setError(null);
    setIsWorking(true);
    try {
      await callFunction<{ status: string }>("manage-subscription", { action });
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile(profile?.id) });
    } catch (caught) {
      console.error("account: plan change failed", caught);
      setError("We couldn't change your plan just then. Try again, or email us and we'll sort it.");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section className="mt-4 overflow-hidden rounded-lg bg-card">
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">Plan</span>
        </div>
        <span className="text-sm font-semibold text-foreground">{plan.name}</span>
      </div>

      <div className="border-t border-border px-4 py-4">
        {status === "past_due" ? (
          <p className="text-sm leading-relaxed text-danger-ink">
            Your last payment didn't go through. Your challenge carries on as normal — update your card and we'll try
            again.
          </p>
        ) : cancelling && renewLabel ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Cancelled. Your plan stays active until {renewLabel}, then stops.
          </p>
        ) : status === "trialing" && renewLabel ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Free until your challenge ends. The first {formatFee(plan.price, currency)} is taken on {renewLabel}, and
            we'll remind you first.
          </p>
        ) : isRecurring && renewLabel ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {formatFee(plan.price, currency)} {intervalSuffix(plan.interval)}. Renews {renewLabel}.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">{plan.detail}</p>
        )}

        {error ? <p className="mt-2 text-sm font-medium text-danger-ink">{error}</p> : null}

        {isRecurring ? (
          <Button
            variant="outline"
            className="mt-3 w-full"
            disabled={isWorking}
            onClick={() => void change(cancelling ? "resume" : "cancel")}
          >
            {isWorking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {cancelling ? "Keep my plan" : "Cancel plan"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-4">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="tabular text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function LinkRow({ icon: Icon, label, href }: { icon: typeof Target; label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between px-4 py-4 transition-colors hover:bg-muted"
    >
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
        <span className="font-medium text-foreground">{label}</span>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
    </a>
  );
}
