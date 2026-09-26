import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, MapPin, ShieldAlert, X } from "lucide-react";
import { useState } from "react";

import { Screen, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import { currencyFrom, formatMoney } from "@/lib/money";
import { callFunction } from "@/lib/supabase";

type QueueItem = {
  id: string;
  userId: string;
  capturedAt: string;
  submittedAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  locationStatus: string;
  timeZone: string;
  photoUrl: string | null;
};

const REVIEW_KEY = ["review", "queue"] as const;
const FINISHED_KEY = ["review", "finished"] as const;

type FinishedItem = {
  id: string;
  email: string | null;
  endedAt: string;
  timeZone: string;
  currency: string;
  deposit: number;
  earned: number;
  verified: number;
  pending: number;
  refundStatus: string;
};

/**
 * The operator's review screens — not participant screens.
 *
 * The endpoint behind them returns 404 to anyone not on the admin allowlist, so
 * the route existing is harmless; a curious user who guesses the URL sees an
 * empty state rather than anyone else's gym photos.
 *
 * Two tabs: the pending proof queue, and finished challenges awaiting their
 * manual refund. Refunds themselves stay in the Stripe Dashboard — Mark refunded
 * only records that the money has gone back, so the app and the person agree.
 */
export default function Review() {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");
  // Optional tip attached to an approval — the same note field, friendlier tone.
  const [noting, setNoting] = useState<string | null>(null);
  const [note, setNote] = useState<string>("");
  const [tab, setTab] = useState<"queue" | "finished">("queue");

  const {
    data,
    isLoading: queueLoading,
    isError: queueError,
  } = useQuery({
    queryKey: REVIEW_KEY,
    queryFn: () => callFunction<{ items: QueueItem[] }>("review-workouts", { action: "list" }),
    staleTime: 0,
    retry: 0,
  });

  // Loaded only when the tab is open: the finished list costs three reads and
  // there is no reason to pay that on every visit to the queue.
  const {
    data: finishedData,
    isLoading: finishedLoading,
    isError: finishedError,
  } = useQuery({
    queryKey: FINISHED_KEY,
    queryFn: () => callFunction<{ items: FinishedItem[] }>("review-workouts", { action: "finished_list" }),
    enabled: tab === "finished",
    staleTime: 0,
    retry: 0,
  });

  const isLoading = queueLoading || (tab === "finished" && finishedLoading);
  const isError = queueError || (tab === "finished" && finishedError);

  const decide = useMutation({
    mutationFn: (input: { submissionId: string; decision: "verified" | "rejected"; reason?: string }) =>
      callFunction<{ status: string }>("review-workouts", { action: "decide", ...input }),
    onSuccess: async () => {
      setRejecting(null);
      setReason("");
      setNoting(null);
      setNote("");
      await queryClient.invalidateQueries({ queryKey: REVIEW_KEY });
    },
  });

  const markRefunded = useMutation({
    mutationFn: (participationId: string) =>
      callFunction<{ status: string }>("review-workouts", { action: "mark_refunded", participationId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FINISHED_KEY }),
  });

  if (isLoading) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <ScreenTitle className="mt-6 text-title">Nothing here</ScreenTitle>
          <ScreenSubtitle>This page isn't available for your account.</ScreenSubtitle>
        </div>
      </Screen>
    );
  }

  const items = data?.items ?? [];
  const finishedItems = finishedData?.items ?? [];

  return (
    <Screen>
      <header className="py-4">
        <ScreenTitle className="text-title">Review</ScreenTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          {tab === "queue" ? (
            <span>
              <span className="tabular">{items.length}</span> waiting
            </span>
          ) : (
            <span>
              <span className="tabular">{finishedItems.length}</span> finished
            </span>
          )}
        </p>

        <div className="mt-3 flex gap-2" role="tablist" aria-label="Review sections">
          <TabButton active={tab === "queue"} onClick={() => setTab("queue")}>
            Queue
          </TabButton>
          <TabButton active={tab === "finished"} onClick={() => setTab("finished")}>
            Finished
          </TabButton>
        </div>
      </header>

      {tab === "finished" ? (
        <FinishedList
          items={finishedItems}
          marking={markRefunded.isPending}
          onMarkRefunded={(participationId) => markRefunded.mutate(participationId)}
        />
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
            <Check className="h-8 w-8 text-success-ink" strokeWidth={3} aria-hidden="true" />
          </div>
          <p className="mt-6 text-lg font-semibold text-foreground">All caught up</p>
          <p className="mt-1 text-sm text-muted-foreground">No workouts waiting on you.</p>
        </div>
      ) : (
        <ul className="space-y-6 pb-10">
          {items.map((item) => {
            const captured = new Date(item.capturedAt);
            const when = new Intl.DateTimeFormat("en-GB", {
              timeZone: item.timeZone,
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            }).format(captured);

            const hasLocation = item.latitude !== null && item.longitude !== null;
            const mapUrl = hasLocation
              ? `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`
              : null;

            return (
              <li key={item.id} className="overflow-hidden rounded-lg bg-card">
                {item.photoUrl ? (
                  <img src={item.photoUrl} alt="Workout proof" className="aspect-[3/4] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[3/4] items-center justify-center bg-muted text-sm text-muted-foreground">
                    Photo unavailable
                  </div>
                )}

                <div className="p-4">
                  <p className="font-semibold text-foreground">{when}</p>

                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {mapUrl ? (
                      <a
                        href={mapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-foreground underline underline-offset-4"
                      >
                        {item.locationStatus === "located" ? "Located" : "Approximate"}
                        {item.accuracyM ? ` \u00b7 ${Math.round(item.accuracyM)}m` : ""}
                      </a>
                    ) : (
                      <span>
                        {item.locationStatus === "denied" ? "Location refused" : "No signal at capture"}
                      </span>
                    )}
                  </div>

                  {rejecting === item.id ? (
                    <div className="mt-4 space-y-3">
                      <input
                        type="text"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Reason shown to them"
                        className="h-12 w-full rounded-md border border-border bg-background px-4 text-base"
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setRejecting(null)}>
                          Cancel
                        </Button>
                        <Button
                          className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({ submissionId: item.id, decision: "rejected", reason: reason.trim() })
                          }
                        >
                          Confirm reject
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setRejecting(item.id);
                            setNoting(null);
                          }}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                          Reject
                        </Button>
                        <Button
                          className="flex-[2]"
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({
                              submissionId: item.id,
                              decision: "verified",
                              reason: note.trim() || undefined,
                            })
                          }
                        >
                          {decide.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                          <Check className="h-4 w-4" aria-hidden="true" />
                          Verify
                        </Button>
                      </div>

                      {noting === item.id ? (
                        <input
                          type="text"
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder="Optional note sent with the approval"
                          className="h-12 w-full rounded-md border border-border bg-background px-4 text-base"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setNoting(item.id)}
                          className="text-xs font-medium text-muted-foreground underline underline-offset-4"
                        >
                          Add a note
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Ended challenges and their refund state, newest first.
 *
 * Earned-back leads because the refund is the deposit minus that figure; the
 * deposit, verified count and pending proofs follow so the number can be
 * sanity-checked at a glance. Pending proofs are called out separately: they
 * are the reason to finish the review before pressing the button.
 */
function FinishedList({
  items,
  marking,
  onMarkRefunded,
}: {
  items: FinishedItem[];
  marking: boolean;
  onMarkRefunded: (participationId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-lg font-semibold text-foreground">Nothing finished yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ended challenges show up here with what to refund.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3 pb-10">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg bg-card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate font-semibold text-foreground">
              {item.email ?? "Unknown account"}
            </p>
            <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
                new Date(item.endedAt),
              )}
            </p>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {formatMoney(item.earned, currencyFrom(item.currency))} earned of{" "}
            {formatMoney(item.deposit, currencyFrom(item.currency))} deposit · {item.verified} verified
            {item.pending > 0 ? ` · ${item.pending} pending` : ""}
          </p>

          <div className="mt-3">
            {item.refundStatus === "refunded" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-success-ink">
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                Returned
              </span>
            ) : (
              <Button className="w-full" disabled={marking} onClick={() => onMarkRefunded(item.id)}>
                {marking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Mark refunded
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
