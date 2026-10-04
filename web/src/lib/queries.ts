import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthProvider";
import type { ChallengeRow, ProfileRow, UserChallengeRow, WorkoutSubmissionRow } from "./database.types";
import { isDepositSettling } from "./settlement";
import { supabase } from "./supabase";
import { decideChallenge } from "./trial";

/** Shared keys, so a mutation can invalidate exactly what it changed. */
export const queryKeys = {
  currentChallenge: (userId: string | undefined) => ["challenge", "current", userId ?? "anon"] as const,
  challengeById: (challengeId: string | null | undefined) => ["challenge", "by-id", challengeId ?? "none"] as const,
  participation: (userId: string | undefined) => ["participation", userId ?? "anon"] as const,
  endedParticipation: (userId: string | undefined) => ["participation", "ended", userId ?? "anon"] as const,
  submissions: (participationId: string | undefined) => ["submissions", participationId ?? "none"] as const,
  profile: (userId: string | undefined) => ["profile", userId ?? "anon"] as const,
};

/**
 * The challenge this person would join next — the decision.
 *
 * The decision — trial week or standard month — is made in one shared place
 * (`decideChallenge`), so every enrolment screen (Ready, BuildChallenge,
 * Commit, Pay) reads the same terms the enrolment acts on. Its result is
 * user-scoped: someone with a paid trial in their history gets the standard
 * challenge even while the experiment is running.
 *
 * Decision screens only. A screen that displays an existing participation must
 * read the challenge that row belongs to — `useChallengeById` — because the
 * decision answers "what's next", not "what am I in".
 */
export function useCurrentChallenge(): UseQueryResult<ChallengeRow | null> {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.currentChallenge(user?.id),
    queryFn: async (): Promise<ChallengeRow | null> => {
      return (await decideChallenge(user?.id ?? null))?.challenge ?? null;
    },
    staleTime: 30_000,
  });
}

/**
 * A challenge by id — the terms a specific participation actually belongs to.
 *
 * Every screen that displays an existing participation (Home's dashboard and
 * verdict, Verify, History, Activated, Account) reads its challenge through
 * this, never through `decideChallenge`: the decision answers "what would this
 * person join next", which is the trial whenever the flag is on. Feeding that
 * into a finished standard month is how trial copy and trial buttons end up on
 * a standard user's screen — the leak this hook keeps closed.
 */
export function useChallengeById(
  challengeId: string | null | undefined,
): UseQueryResult<ChallengeRow | null> {
  return useQuery({
    queryKey: queryKeys.challengeById(challengeId),
    enabled: Boolean(challengeId),
    queryFn: async (): Promise<ChallengeRow | null> => {
      const { data, error } = await supabase
        .from("challenges")
        .select("*")
        .eq("id", challengeId ?? "")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
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

/**
 * The most recent finished participation, if any.
 *
 * Read by the start flow so it can say where the previous deposit stands —
 * "being returned" until the operator records the refund, "returned" after.
 * Paid rows only: an abandoned signup says nothing about money coming back.
 */
export function useEndedParticipation(): UseQueryResult<UserChallengeRow | null> {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.endedParticipation(user?.id),
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<UserChallengeRow | null> => {
      const { data, error } = await supabase
        .from("user_challenges")
        .select("*")
        .eq("payment_status", "paid")
        .lt("ends_at", new Date().toISOString())
        .order("ends_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    // Refunds are recorded from the operator screen, so this re-reads on return
    // rather than serving a stale "being returned".
    refetchOnWindowFocus: true,
  });
}

/**
 * The signed-in user's profile, which carries their membership state.
 *
 * Every billing column on it is written by the Stripe webhook through the
 * service role and blocked from the client by a database trigger, so what this
 * returns is the settled truth rather than anything the app decided locally.
 */
export function useProfile(): UseQueryResult<ProfileRow | null> {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.profile(user?.id),
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ProfileRow | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    // A plan is granted by the webhook a beat after the card clears, so this is
    // re-read on return rather than served from a cache written before payment.
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
