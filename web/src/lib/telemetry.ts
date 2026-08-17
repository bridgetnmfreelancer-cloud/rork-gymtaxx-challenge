import { isStandalone } from "./pwa";
import { supabase } from "./supabase";

/**
 * Records that the app was opened, and whether it was launched from the home
 * screen rather than a browser tab.
 *
 * The install step is the biggest known drop-off in the funnel, and until now
 * the only evidence of an install was a push registration — which conflates
 * installing with agreeing to reminders. This separates the two.
 *
 * Deliberately fire-and-forget. This is measurement, and a failure here must
 * never surface to someone trying to log a workout.
 */
export async function recordAppOpen(): Promise<void> {
  try {
    const { error } = await supabase.rpc("mark_app_open", { p_standalone: isStandalone() });
    if (error) console.warn("app open not recorded", error.message);
  } catch (err) {
    console.warn("app open not recorded", err);
  }
}

/**
 * Records that the three onboarding questions were finished.
 *
 * The answers themselves stay on the phone until there's a reason to store
 * them; only the fact that someone got through is needed to see whether the
 * questions are where people give up.
 *
 * Fire-and-forget for the same reason as {@link recordAppOpen} — this must
 * never interrupt someone mid-flow.
 */
export async function recordQuestionsAnswered(): Promise<void> {
  try {
    const { error } = await supabase.rpc("mark_questions_answered");
    if (error) console.warn("questions completion not recorded", error.message);
  } catch (err) {
    console.warn("questions completion not recorded", err);
  }
}
