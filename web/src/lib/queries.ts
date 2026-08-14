import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthProvider";
import type { ChallengeRow, UserChallengeRow, WorkoutSubmissionRow } from "./database.types";
import { isDepositSettling } from "./settlement";
import { supabase } from "./supabase";

/** Shared keys, so a mutation can invalidate exactly what it changed. */
export const queryKeys = {
  currentChallenge: ["challenge", "current"] as const,
  participation: (userId: string | undefined) => ["participation", userId ?? "anon"] as const,
  submissions: (participationId: string | undefined) => ["submissions", participationId ?? "none"] as const,
};

/**
 * The challenge everyone joins right now.
 *
 * There is one live challenge at a time; its row carries the shared terms
 * (length, reward per workout) that the deposit is calculated from on the
 * server. Reading it here keeps the numbers on screen and the amount charged
 * derived from the same source.
 */
export function useCurrentChallenge(): UseQueryResult<ChallengeRow | null> {
  return useQuery({
    queryKey: queryKeys.currentChallenge,
    queryFn: async (): Promise<ChallengeRow | null> => {
      const { data, error } = await supabase
        .from("challenges")
        .select("*")
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * The signed-in user's active participation, if they have one.
 *
 * Rows are created unpaid, and only the Stripe webhook marks one paid. That
 * happens a beat after the card is charged, so the query polls itself while a
 * deposit is settling — every screen reading this key picks up the confirmation
 * without needing to know a payment just happened.
 */
export function useParticipation(): UseQueryResult<UserChallengeRow | null> {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.participation(user?.id),
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<UserChallengeRow | null> => {
      const { data, error } = await supabase
        .from("user_challenges")
        .select("*")
        .eq("challenge_status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    // Off unless a payment is actually in flight, so the normal case costs
    // nothing. Stops the moment the row reads paid, and the marker expires on
    // its own, so this can't turn into a permanent polling loop.
    refetchInterval: (query) => {
      if (query.state.data?.payment_status === "paid") return false;
      return isDepositSettling() ? 1_500 : false;
    },
    // A 3-D Secure detour can suspend the app mid-payment; coming back should
    // re-read rather than trust what was cached before the card was charged.
    refetchOnWindowFocus: true,
  });
}

/** Every submission for a participation, newest first. */
export function useSubmissions(participationId: string | undefined): UseQueryResult<WorkoutSubmissionRow[]> {
  return useQuery({
    queryKey: queryKeys.submissions(participationId),
    enabled: Boolean(participationId),
    queryFn: async (): Promise<WorkoutSubmissionRow[]> => {
      const { data, error } = await supabase
        .from("workout_submissions")
        .select("*")
        .eq("user_challenge_id", participationId ?? "")
        .order("captured_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
