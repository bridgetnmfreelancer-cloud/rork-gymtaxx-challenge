import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { Screen, ScreenActions, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthProvider";
import { formatStartDate } from "@/lib/gymweek";
import { currencyFrom, depositFor, formatMoney } from "@/lib/money";
import { queryKeys, useCurrentChallenge, useParticipation } from "@/lib/queries";
import { CHALLENGE_WEEKS } from "@/lib/money";

/**
 * Step 12: the moment the commitment becomes real.
 *
 * The webhook marks the deposit paid a beat after Stripe confirms, so this
 * screen refetches the participation on arrival rather than trusting whatever
 * was cached before the payment.
 */
export default function Activated() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: participation } = useParticipation();
  const { data: challenge } = useCurrentChallenge();

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.participation(user?.id) });
  }, [queryClient, user?.id]);

  const currency = currencyFrom(participation?.currency);
  const weeks = challenge?.number_of_weeks ?? CHALLENGE_WEEKS;
  const goal = participation?.goal_workouts_per_week ?? 4;

  const startLabel = useMemo(() => {
    if (!participation) return null;
    return formatStartDate(
      new Date(participation.started_at),
      participation.time_zone,
      currency === "gbp" ? "en-GB" : "en-US",
    );
  }, [participation, currency]);

  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent animate-pop-in">
          <Check className="h-12 w-12 text-success-ink" strokeWidth={3} aria-hidden="true" />
        </div>

        <ScreenTitle className="mt-8 animate-rise-in [animation-delay:200ms]">You're locked in.</ScreenTitle>

        <dl className="mt-10 w-full divide-y divide-border overflow-hidden rounded-lg bg-card text-left animate-rise-in [animation-delay:320ms]">
          {startLabel ? <Row label="Starts" value={startLabel} /> : null}
          <Row label="Goal" value={`${goal}\u00d7 per week`} />
          <Row label="Commitment" value={formatMoney(depositFor(goal, weeks), currency)} />
        </dl>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground animate-rise-in [animation-delay:400ms]">
          Nothing more will be charged. From here it's on you.
        </p>
      </div>

      <ScreenActions>
        <Button size="xl" className="w-full" onClick={() => navigate("/home", { replace: true })}>
          Go to my dashboard
        </Button>
      </ScreenActions>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="tabular text-base font-semibold text-foreground">{value}</dd>
    </div>
  );
}
