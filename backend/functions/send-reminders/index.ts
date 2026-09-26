import webpush from "npm:web-push@3.6.7";

import { corsHeaders, createAdminClient, json } from "../_shared/auth.ts";
import { currentWeekStart, safeZone } from "../_shared/gymweek.ts";
import { MAX_FAILURES } from "../_shared/push.ts";

/**
 * Sends the reminders that bring people back.
 *
 * Three audiences, deliberately treated differently:
 *
 * - **Mid-challenge and behind.** Told while there is still time to fix it,
 *   never after the week has closed. A reminder that arrives too late to act
 *   on just tells someone they've lost money.
 * - **Not in a challenge.** A four-week sequence pointing back at the one thing
 *   left to do, then silence. Thursday and Sunday in week one; Monday at 6pm and
 *   Sunday after that, with different words every week.
 * - **Just finished.** A verdict push within a couple of days of the four weeks
 *   ending, then — if they haven't started again — one rejoin nudge a few days
 *   later. After that, silence unless they come back.
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

const MONDAY = 1;
const WEDNESDAY = 3;
const DAY_MS = 86_400_000;

type Message = { title: string; body: string; atHour?: number };

/**
 * The pre-challenge sequence, one entry per week, each keyed by local weekday
 * (0 = Sunday). Every message is written for someone who has never paid — the
 * wording never assumes how far they got, so the same words fit someone who
 * never built a challenge and someone who built one and never paid.
 *
 * The week has its own shape: `atHour` pins a message to a specific local hour
 * (the Monday messages are written for 6pm) while everything else rides the
 * general evening window.
 */
const PRE_CHALLENGE_SEQUENCE: Record<number, Record<number, Message | undefined>> = {
  1: {
    4: {
      title: "Be honest. How did this week go?",
      body: "Are you being consistent with the gym? We are still here for you if you need a little extra accountability.",
    },
    0: {
      title: "Picture yourself 4 weeks from now",
      body: "Wouldn't it be nice to say you actually stuck to it?",
    },
  },
  2: {
    1: {
      title: "2 choices today",
      body: "Keep promising you'll find the motivation to go to the gym OR actually go to the gym with GymTaxx accountability. Take your pick! \u{1F937}\u{200D}\u{2640}\u{FE0F}",
      atHour: 18,
    },
    0: {
      title: "So did you actually go to the gym this week?",
      body: "If not, maybe it's time for you to try something different.",
    },
  },
  3: {
    1: {
      title: "Don't want another subscription?",
      body: "You can start today with just one GymTaxx challenge. No commitment. No pressure.",
      atHour: 18,
    },
    0: {
      title: "Planning to go to the gym next week?",
      body: "How many times have you told yourself that before? \u{1FAE4} With us, you won't have any doubts whether you'll stick to it.",
    },
  },
  4: {
    1: {
      title: "Still relying on motivation?",
      body: "To go to the gym this week? You already know how that turns out. We are still here if you want to try having an accountability partner.",
      atHour: 18,
    },
    0: {
      title: "It's been almost a month \u{1F440}",
      body: "Are you going to the gym consistently without us? If not, what do you have to lose by giving us a chance. First challenge free.",
    },
  },
};

/** The last week anyone yet to start a challenge hears from us. */
const FINAL_WEEK = 4;

/** The one-off nudge a few hours after signing up. */
const WELCOME: Message = {
  title: "You're almost there \u{1F440}",
  body: "This could be the month you finally stick with your goals. Finish setting up your challenge now.",
};

/**
 * How long after registering the welcome may go out. The lower bound keeps it
 * from arriving while they're still in the app; the upper bound stops a device
 * that has somehow never been messaged from getting a "just signed up" note
 * weeks later.
 */
const WELCOME_MIN_HOURS = 3;
const WELCOME_MAX_HOURS = 72;

/**
 * A wider window than the evening one, because the welcome is timed from the
 * sign-up rather than the clock. Sign-ups peak late at night and three hours
 * after a 1am sign-up is 4am, so a late joiner is held until the morning.
 */
const WELCOME_HOUR_START = 9;
const WELCOME_HOUR_END = 21;

/**
 * Midway through the first week, for someone who has not logged anything at all
 * yet. Their deposit is down and nothing is coming back, which is the worst
 * position to be in silently — and Wednesday still leaves most of the week to
 * fix it.
 */
const FIRST_WORKOUT_CHECK_IN: Message = {
  title: "Wednesday check-in \u{1F440}",
  body:
    "Just checking in for your first workout. Don't forget to log your workouts when you go to the gym to secure your deposit!",
};

/**
 * The one-off pushes at the end of a challenge, sent from the same hourly run.
 * The copy is placeholder until the real words arrive; the slots are what matter.
 */
const CLOSE_PUSH: Message = {
  title: "Your month is done",
  body: "Your challenge has finished. Open GymTaxx to see where your deposit landed.",
};

const REJOIN_PUSH: Message = {
  title: "Ready for another month?",
  body: "Start your next challenge and put something behind it again.",
};

/**
 * How long after the end the verdict is still news. Past this the challenge is
 * marked without sending — "your month is done" landing three weeks late is
 * noise, and marking it keeps this branch from re-deciding every hour.
 */
const CLOSE_PUSH_MAX_DAYS = 2;

/** The rejoin nudge waits a few days, then gives up entirely after ten. */
const REJOIN_AFTER_DAYS = 3;
const REJOIN_MAX_DAYS = 10;

type Subscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  time_zone: string;
  last_sent_on: string | null;
  failure_count: number;
  created_at: string;
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

/** The local calendar date one day before `now`, as the user would read it. */
function previousLocalDate(now: Date, zone: string): string {
  return localParts(new Date(now.getTime() - DAY_MS), zone).date;
}

/** A local calendar date as a plain day count, so days can be subtracted. */
function localDayNumber(at: Date, zone: string): number {
  const [year, month, day] = localParts(at, zone).date.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

/**
 * Which week of the pre-challenge sequence someone is in, counting from 1.
 *
 * Week one runs from signing up until the first Monday *after* that — the last
 * day a challenge can still start in the week they joined, and the natural end
 * of the opening sequence. Every week after that is a plain seven days.
 *
 * Returns a number above `FINAL_WEEK` once the sequence is spent.
 */
function preChallengeWeek(signedUpAt: Date, now: Date, zone: string): number {
  const signUpDay = localDayNumber(signedUpAt, zone);
  const signUpWeekday = localParts(signedUpAt, zone).weekday;

  // Signing up on a Monday means the following Monday, not the same evening.
  const daysToMonday = signUpWeekday === MONDAY ? 7 : (8 - signUpWeekday) % 7;
  const closingMonday = signUpDay + daysToMonday;

  const today = localDayNumber(now, zone);
  if (today <= closingMonday) return 1;

  return 1 + Math.ceil((today - closingMonday) / 7);
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
    .select("id, user_id, endpoint, p256dh, auth, time_zone, last_sent_on, failure_count, created_at")
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

      // Never twice in one local day, whoever they are. Acceptable hours differ
      // per message, so those are checked inside each branch below.
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
      let url = "/home";
      let tag = "gymtaxx-reminder";
      let closeDue = false;
      let rejoinDue = false;

      if (!participation) {
        // Between challenges. Three kinds of person land here, and each gets
        // different words: someone whose four weeks just ended, someone who
        // ended a while ago and has already heard everything, and someone who
        // has never finished setting up.
        const { data: endedRow } = await admin
          .from("user_challenges")
          .select("id, ends_at, closed_push_at, rejoin_push_at")
          .eq("user_id", sub.user_id)
          .eq("payment_status", "paid")
          .eq("challenge_status", "active")
          .lte("ends_at", now.toISOString())
          .order("ends_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const ended = endedRow as {
          id: string;
          ends_at: string;
          closed_push_at: string | null;
          rejoin_push_at: string | null;
        } | null;

        if (ended) {
          const daysSinceEnd = (now.getTime() - new Date(ended.ends_at).getTime()) / DAY_MS;
          const inEveningWindow = hour >= SEND_HOUR_START && hour <= SEND_HOUR_END;

          // The verdict, once per challenge. A challenge that ended long ago is
          // marked without sending — stale news is noise, and the marker keeps
          // this branch from re-deciding every hour.
          if (ended.closed_push_at === null) {
            if (daysSinceEnd > CLOSE_PUSH_MAX_DAYS) {
              await admin
                .from("user_challenges")
                .update({ closed_push_at: now.toISOString() })
                .eq("id", ended.id);
              skipped += 1;
              continue;
            }
            if (!inEveningWindow) {
              skipped += 1;
              continue;
            }
            title = CLOSE_PUSH.title;
            body = CLOSE_PUSH.body;
            tag = "gymtaxx-close";
            closeDue = true;
          } else if (
            ended.rejoin_push_at === null &&
            daysSinceEnd >= REJOIN_AFTER_DAYS &&
            daysSinceEnd <= REJOIN_MAX_DAYS
          ) {
            if (!inEveningWindow) {
              skipped += 1;
              continue;
            }
            title = REJOIN_PUSH.title;
            body = REJOIN_PUSH.body;
            url = "/challenge";
            tag = "gymtaxx-rejoin";
            rejoinDue = true;
          } else {
            skipped += 1;
            continue;
          }
        } else {
          const { count: paidBefore } = await admin
            .from("user_challenges")
            .select("id", { count: "exact", head: true })
            .eq("user_id", sub.user_id)
            .eq("payment_status", "paid");

          // Someone who has paid before but already heard everything stays
          // silent — inviting them to take a first step they've already taken
          // reads as if we weren't paying attention.
          if ((paidBefore ?? 0) > 0) {
            skipped += 1;
            continue;
          }

          const ageHours = (now.getTime() - new Date(sub.created_at).getTime()) / 3_600_000;
          const isWelcomeDue =
            sub.last_sent_on === null && ageHours >= WELCOME_MIN_HOURS && ageHours <= WELCOME_MAX_HOURS;

          if (isWelcomeDue) {
            if (hour < WELCOME_HOUR_START || hour > WELCOME_HOUR_END) {
              skipped += 1;
              continue;
            }
            title = WELCOME.title;
            body = WELCOME.body;
          } else {
            const week = preChallengeWeek(new Date(sub.created_at), now, zone);
            if (week > FINAL_WEEK) {
              skipped += 1;
              continue;
            }

            const scheduled = PRE_CHALLENGE_SEQUENCE[week]?.[weekday];

            // Each message can pin its own earliest hour — the Monday ones are
            // written for 6pm — and otherwise rides the general evening window.
            const earliestHour = scheduled?.atHour ?? SEND_HOUR_START;
            if (!scheduled || hour < earliestHour || hour > SEND_HOUR_END) {
              skipped += 1;
              continue;
            }

            // Two evenings running reads as pestering, which is exactly what a
            // Saturday sign-up would otherwise get. Monday is the exception: the
            // Sunday-then-Monday pair is written to land back to back, so it goes
            // out even to someone who heard from us the night before.
            if (weekday !== MONDAY && sub.last_sent_on === previousLocalDate(now, zone)) {
              skipped += 1;
              continue;
            }

            title = scheduled.title;
            body = scheduled.body;
          }
        }
      } else {
        const goal = participation.goal_workouts_per_week;
        const weekStart = currentWeekStart(now, safeZone(participation.time_zone));

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

        // "Your first workout" has to actually be their first, so this looks at
        // the whole challenge rather than just this week — and counts every
        // submission regardless of status, because someone whose proof was
        // rejected has still logged one and needs the count, not the welcome.
        let isFirstEver = false;
        if (weekday === WEDNESDAY && done === 0) {
          const { count: everCount } = await admin
            .from("workout_submissions")
            .select("id", { count: "exact", head: true })
            .eq("user_challenge_id", participation.id);
          isFirstEver = (everCount ?? 0) === 0;
        }

        const daysLeft = weekday === 0 ? 1 : 7 - weekday + 1;

        if (isFirstEver) {
          title = FIRST_WORKOUT_CHECK_IN.title;
          body = FIRST_WORKOUT_CHECK_IN.body;
        } else if (weekday === 0) {
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
        JSON.stringify({ title, body, url, tag }),
      );

      // The close and rejoin pushes each carry their own once-marker on the
      // participation row, written only when the push actually went out.
      const markSent: Record<string, string | number> = { last_sent_on: date, failure_count: 0 };
      if (closeDue) markSent.closed_push_at = now.toISOString();
      if (rejoinDue) markSent.rejoin_push_at = now.toISOString();

      await admin.from("push_subscriptions").update(markSent).eq("id", sub.id);

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
