/**
 * Database shape.
 *
 * The real definitions live in `src/integrations/supabase/types.ts`, which is
 * regenerated automatically every time a migration runs. This file only adds
 * the short row aliases the app uses.
 *
 * It used to be a hand-copied duplicate of the schema, which silently went
 * stale the moment a table was added. Re-exporting means that can't happen
 * again.
 */

export type { Database, Json } from "@/integrations/supabase/types";

import type { Database } from "@/integrations/supabase/types";

export type ChallengeRow = Database["public"]["Tables"]["challenges"]["Row"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type UserChallengeRow = Database["public"]["Tables"]["user_challenges"]["Row"];
export type WorkoutSubmissionRow = Database["public"]["Tables"]["workout_submissions"]["Row"];
export type PushSubscriptionRow = Database["public"]["Tables"]["push_subscriptions"]["Row"];
