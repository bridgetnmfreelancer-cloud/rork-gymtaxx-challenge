import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { metaAttribution } from "@/lib/meta";
import { currencyFrom, formatMoney } from "@/lib/money";
import { clearDepositSettling, markDepositSettling } from "@/lib/settlement";
import { callFunction } from "@/lib/supabase";

type DepositResponse =
  | { status: "paid" }
  | {
      status: "requires_payment";
      clientSecret: string;
      publishableKey: string;
      amountMinor: number;
      currency: string;
    };

/**
 * Stripe's publishable key arrives with the payment intent rather than being
 * baked into the bundle, so switching Stripe mode is a server change only.
 * Cached per key because `loadStripe` must not run on every render.
 */
const stripeCache = new Map<string, Promise<Stripe | null>>();

function stripeFor(publishableKey: string): Promise<Stripe | null> {
  const cached = stripeCache.get(publishableKey);
  if (cached) return cached;
  const created = loadStripe(publishableKey);
  stripeCache.set(publishableKey, created);
  return created;
}

/**
 * Step 11: the deposit itself.
 *
 * The amount is never sent from here — the server derives it from the goal on
 * the participation record, so the client cannot choose what to pay.
 */
export default function Pay() {
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["deposit-intent"],
    // The Meta cookies ride along so the server can record who is paying while
    // the person is actually here. The Purchase event is sent later, server-side,
    // once Stripe confirms the money — never from this screen.
    queryFn: () => callFunction<DepositResponse>("create-deposit-payment", metaAttribution()),
    // A payment intent is single-use state, not something to serve from cache.
    staleTime: 0,
    gcTime: 0,
    retry: 0,
  });

  const stripePromise = useMemo(() => {
    if (!data || data.status !== "requires_payment") return null;
    return stripeFor(data.publishableKey);
  }, [data]);

  if (isLoading) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen>
        <StepProgress step={2} total={2} onBack={() => navigate(-1)} />
        <div className="pt-8">
          <ScreenTitle>We couldn't open the payment page.</ScreenTitle>
          <ScreenSubtitle>Your money hasn't moved. Check your connection and try again.</ScreenSubtitle>
        </div>
        <ScreenActions>
          <Button size="xl" className="w-full" onClick={() => void refetch()}>
            Try again
          </Button>
        </ScreenActions>
      </Screen>
    );
  }

  if (data.status === "paid") {
    // Declarative redirect rather than navigating from the render body, which
    // React treats as a side effect during render.
    return <Navigate to="/activated" replace />;
  }

  const currency = currencyFrom(data.currency);
  const amount = data.amountMinor / 100;

  return (
    <Screen>
      <StepProgress step={2} total={2} onBack={() => navigate(-1)} />

      <div className="pt-6">
        <ScreenTitle className="animate-rise-in">Secure your commitment</ScreenTitle>
        <ScreenSubtitle className="animate-rise-in [animation-delay:60ms]">
          {formatMoney(amount, currency)} held now, earned back {formatMoney(5, currency)} at a time.
        </ScreenSubtitle>
      </div>

      {stripePromise ? (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: data.clientSecret,
            appearance: {
              theme: "flat",
              variables: {
                colorPrimary: "#0F172A",
                colorBackground: "#F8FAFC",
                colorText: "#0F172A",
                colorDanger: "#B91C1C",
                borderRadius: "12px",
                fontSizeBase: "16px",
                spacingUnit: "4px",
              },
            },
          }}
        >
          <PaymentForm amountLabel={formatMoney(amount, currency)} />
        </Elements>
      ) : null}
    </Screen>
  );
}

function PaymentForm({ amountLabel }: { amountLabel: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();

  const [isPaying, setIsPaying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!stripe || !elements || isPaying) return;

    setError(null);
    setIsPaying(true);

    // Marked before confirming, not after. A 3-D Secure challenge redirects away
    // mid-call and may never return to this line, so setting it afterwards would
    // miss exactly the payments most likely to be slow to confirm.
    markDepositSettling();

    try {
      const result = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: `${window.location.origin}/activated`,
        },
      });

      if (result.error) {
        // No money moved, so the marker has to go — otherwise a decline would
        // leave them on a screen insisting their deposit is being confirmed.
        clearDepositSettling();
        // Card declines and validation problems both land here, and Stripe's
        // own message is clearer than anything generic we could write.
        setError(result.error.message ?? "That payment didn't go through. Try another card.");
        return;
      }

      navigate("/activated", { replace: true });
    } catch (caught) {
      console.error("pay: confirmation failed", caught);
      // Deliberately left in place: an interrupted confirmation may still have
      // been captured by Stripe, so the waiting screen is the honest state
      // rather than telling them nothing happened.
      setError("Something interrupted the payment. Check your connection and try again.");
    } finally {
      setIsPaying(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-1 flex-col animate-rise-in [animation-delay:120ms]">
      <PaymentElement options={{ layout: "tabs" }} />

      {error ? (
        <p role="alert" className="mt-4 rounded-md bg-destructive/15 px-4 py-3 text-sm font-medium text-danger-ink">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Payments handled by Stripe. We never see your card details.</span>
      </div>

      <ScreenActions>
        <Button type="submit" size="xl" className="w-full" disabled={!stripe || isPaying}>
          {isPaying ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
          Pay {amountLabel}
        </Button>
      </ScreenActions>
    </form>
  );
}
