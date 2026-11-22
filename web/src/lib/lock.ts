import { supabase } from "./supabase";

const PAYMENTS_CONFIG_KEY = "payments_enabled";

/**
 * Whether the site is open for business.
 *
 * One row in `app_config` decides it — the same mechanism the trial
 * experiment uses, so pausing and reopening the site are one SQL command with
 * no deploy. The payment server reads the same row and refuses to charge
 * anyone while it is off, so the screen can never be the thing that lets
 * money move.
 *
 * A read error fails OPEN here on purpose: a flaky connection must not tell a
 * member the site is closed when it isn't. The server-side guard fails the
 * other way — closed — because there, the mistake that matters is charging
 * someone.
 */
export async function isPaymentsOpen(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", PAYMENTS_CONFIG_KEY)
      .maybeSingle();
    if (error) {
      console.error("lock: could not read payments switch", error.message);
      return true;
    }
    return data?.value === "on";
  } catch (error) {
    console.error("lock: could not read payments switch", error);
    return true;
  }
}
