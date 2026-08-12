import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, MapPin, ShieldAlert, X } from "lucide-react";
import { useState } from "react";

import { Screen, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/ui/button";
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

/**
 * The operator's review queue — not a participant screen.
 *
 * The endpoint behind it returns 404 to anyone not on the admin allowlist, so
 * the route existing is harmless; a curious user who guesses the URL sees an
 * empty state rather than anyone else's gym photos.
 */
export default function Review() {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");

  const { data, isLoading, isError } = useQuery({
    queryKey: REVIEW_KEY,
    queryFn: () => callFunction<{ items: QueueItem[] }>("review-workouts", { action: "list" }),
    staleTime: 0,
    retry: 0,
  });

  const decide = useMutation({
    mutationFn: (input: { submissionId: string; decision: "verified" | "rejected"; reason?: string }) =>
      callFunction<{ status: string }>("review-workouts", { action: "decide", ...input }),
    onSuccess: async () => {
      setRejecting(null);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: REVIEW_KEY });
    },
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

  return (
    <Screen>
      <header className="py-4">
        <ScreenTitle className="text-title">Review queue</ScreenTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="tabular">{items.length}</span> waiting
        </p>
      </header>

      {items.length === 0 ? (
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
                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setRejecting(item.id)}>
                        <X className="h-4 w-4" aria-hidden="true" />
                        Reject
                      </Button>
                      <Button
                        className="flex-[2]"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ submissionId: item.id, decision: "verified" })}
                      >
                        {decide.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Verify
                      </Button>
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
