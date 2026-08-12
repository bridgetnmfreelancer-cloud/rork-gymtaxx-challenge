import webpush from "npm:web-push@3.6.7";

import { corsHeaders, createAdminClient, json } from "../_shared/auth.ts";
import { safeZone, weeklyStart } from "../_shared/gymweek.ts";

/**
 * Sends the reminders that bring people back.
 *
 * Two audiences, deliberately treated differently:
 *
 * - **Mid-challenge and behind.** Told while there is still time to fix it,
 *   never after the week has closed. A reminder that arrives too late to act
 *   on just tells someone they've lost money.
 * - **Installed but never paid.** Nudged back to the start screen, at most
 *   once a week. This is the return path the whole install-first funnel exists
 *   to create, so it has to earn its place without becoming spam.
 *
 * Meant to be called hourly by a scheduler. Each run only sends to people
 * whose *local* time is in the evening window, which is how one hourly job
 * serves every time zone without waking anyone at 3am.
 */

/** Local hours during which a reminder is acceptable. */
const SEND_HOUR_START = 17;
const SEND_HOUR_END = 20;

/** Days a behind-schedule participant hears from us (0 = Sunday). */
const NAG_DAYS = new Set<number>([3, 5, 0]);
/** Day a non-paying installer gets their weekly nudge. */
const WINBACK_DAY = 0;

/** After this many consecutive delivery failures, stop trying this device. */
const MAX_FAILURES = 5;

type Subscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  time_zone: string;
  last_sent_on: string | null;
  failure_count: number;
};

/** The local calendar date and hour for a zone, as the user would read them. */
function localParts(now: Date, zone: string): { date: string; hour: number; weekday: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    weekday: "short",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";

  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number.parseInt(get("hour"), 10) % 24,
    weekday: weekdayMap[get("weekday")] ?? 1,
  };
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Scheduler-only endpoint: a shared secret, not a user session.
  const secret = Deno.env.get("REMINDER_CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return json({ error: "not_found" }, 404);
  }

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const contact = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@gymtaxx.com";
  if (!publicKey || !privateKey) {
    console.error("send-reminders: VAPID keys missing");
    return json({ error: "not_configured" }, 500);
  }
  webpush.setVapidDetails(contact, publicKey, privateKey);

  const admin = createAdminClient();
  const now = new Date();

  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, time_zone, last_sent_on, failure_count")
    .lt("failure_count", MAX_FAILURES);

  if (error) {
    console.error("send-reminders: could not read subscriptions", error.message);
    return json({ error: "read_failed" }, 500);
  }

  let sent = 0;
  let skipped = 0;

  for (const sub of (subscriptions ?? []) as Subscription[]) {
    try {
      const zone = safeZone(sub.time_zone);
      const { date, hour, weekday } = localParts(now, zone);

      // Right hour, and never twice in one local day.
      if (hour < SEND_HOUR_START || hour > SEND_HOUR_END) {
        skipped += 1;
        continue;
      }
      if (sub.last_sent_on === date) {
        skipped += 1;
        continue;
      }

      const { data: participation } = await admin
        .from("user_challenges")
        .select("id, goal_workouts_per_week, ends_at, time_zone, payment_status, challenge_status")
        .eq("user_id", sub.user_id)
        .eq("payment_status", "paid")
        .eq("challenge_status", "active")
        .gt("ends_at", now.toISOString())
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let title: string;
      let body: string;
      let url: string;

      if (!participation) {
        // Never paid, or finished. One nudge a week, on the day before a
        // Monday start — the moment it's easiest to say yes.
        if (weekday !== WINBACK_DAY) {
          skipped += 1;
          continue;
        }
        title = "Your challenge starts tomorrow";
        body = "You built it. Put something behind it and it begins Monday.";
        url = "/home";
      } else {
        const goal = participation.goal_workouts_per_week;
        const weekStart = weeklyStart(now, safeZone(participation.time_zone));

        const { count } = await admin
          .from("workout_submissions")
          .select("id", { count: "exact", head: true })
          .eq("user_challenge_id", participation.id)
          .in("status", ["pending", "verified"])
          .gte("captured_at", weekStart.toISOString());

        const done = count ?? 0;
        const remaining = goal - done;

        if (remaining <= 0) {
          skipped += 1;
          continue;
        }
        if (!NAG_DAYS.has(weekday)) {
          skipped += 1;
          continue;
        }

        const daysLeft = weekday === 0 ? 1 : 7 - weekday + 1;

        if (weekday === 0) {
          title = remaining === 1 ? "One workout left today" : `${remaining} workouts left today`;
          body = "The week closes at midnight. After that it's gone.";
        } else {
          title = `${remaining} to go this week`;
          body = `${done} of ${goal} done, ${daysLeft} ${plural(daysLeft, "day", "days")} left.`;
        }
        url = "/verify";
      }

      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({ title, body, url, tag: "gymtaxx-reminder" }),
      );

      await admin
        .from("push_subscriptions")
        .update({ last_sent_on: date, failure_count: 0 })
        .eq("id", sub.id);

      sent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;

      // 404/410 mean the browser threw the subscription away — the app was
      // deleted or reinstalled. Remove it rather than retrying forever.
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("send-reminders: delivery failed", statusCode ?? "unknown");
        await admin
          .from("push_subscriptions")
          .update({ failure_count: sub.failure_count + 1 })
          .eq("id", sub.id);
      }
    }
  }

  return json({ sent, skipped });
});
