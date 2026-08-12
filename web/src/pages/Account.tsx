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
import { formatStartDate } from "@/lib/gymweek";
import { CHALLENGE_WEEKS, currencyFrom, depositFor, formatMoney } from "@/lib/money";
import { hasActiveReminders, registerForReminders, unregisterReminders } from "@/lib/push";
import { canUsePush, isIOS, isStandalone } from "@/lib/pwa";
import { useCurrentChallenge, useParticipation } from "@/lib/queries";
import { callFunction } from "@/lib/supabase";

const SUPPORT_EMAIL = "support@gymtaxx.com";
const TERMS_URL = "https://www.gymtaxx.com/terms";
const PRIVACY_URL = "https://www.gymtaxx.com/privacy";
const SUPPORT_URL = "https://www.gymtaxx.com/support";

type TestState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; message: string }
  | { kind: "error"; message: string };

export default function Account() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();
  const { data: participation } = useParticipation();
  const { data: challenge } = useCurrentChallenge();

  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [testState, setTestState] = useState<TestState>({ kind: "idle" });
  const [isTestActivating, setIsTestActivating] = useState<boolean>(false);

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
  const isAdmin = adminInfo?.isAdmin === true;

  const currency = currencyFrom(participation?.currency);
  const weeks = challenge?.number_of_weeks ?? CHALLENGE_WEEKS;
  const locale = currency === "gbp" ? "en-GB" : "en-US";

  const startLabel = useMemo(() => {
    if (!participation) return null;
    return formatStartDate(new Date(participation.started_at), participation.time_zone, locale);
  }, [participation, locale]);

  const notInstalled = isIOS() && !isStandalone();
  const pushAvailable = canUsePush();
  const [remindersOn, setRemindersOn] = useState<boolean>(false);
  const [isTogglingReminders, setIsTogglingReminders] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    void hasActiveReminders().then((active) => {
      if (!cancelled) setRemindersOn(active);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleReminders = useCallback(async (next: boolean): Promise<void> => {
    setIsTogglingReminders(true);
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
      setRemindersOn(await registerForReminders());
    } catch (error) {
      console.error("account: reminder toggle failed", error);
      setRemindersOn(false);
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
          message: "This phone isn't registered yet. Turn the switch off and back on, then try again.",
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

          {remindersOn ? (
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
