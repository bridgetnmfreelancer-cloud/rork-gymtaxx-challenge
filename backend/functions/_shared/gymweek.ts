/**
 * Week boundaries, mirroring `GymWeek.swift` on the client.
 *
 * Challenges open on Mondays at 00:00 in the *participant's own* time zone, which
 * is stored against their record when they join. Deno has no timezone-aware date
 * type, so we derive wall-clock time from `Intl` rather than assuming UTC —
 * getting this wrong would shift a start date by hours, or by a whole day for
 * someone joining on a Sunday evening in California.
 */

/** The zone every pre-1.1 challenge ran on, and the fallback for bad input. */
export const DEFAULT_ZONE = "Europe/London";

const DAY_MS = 86_400_000;

/**
 * A stored zone we can safely hand to `Intl`.
 *
 * An unrecognised identifier would otherwise throw inside a webhook and leave a
 * paid deposit unmarked, so anything unusable falls back to London.
 */
export function safeZone(zone: string | null | undefined): string {
  if (!zone) return DEFAULT_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    console.error("gymweek: unusable time zone, falling back to London", zone);
    return DEFAULT_ZONE;
  }
}

/** How far `zone` is ahead of UTC at a given instant, in milliseconds. */
function zoneOffsetMs(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const value = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asIfUTC = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour") % 24,
    value("minute"),
    value("second"),
  );
  return asIfUTC - at.getTime();
}

/** The instant of 00:00 in `zone` on the given local calendar date. */
function zoneMidnight(year: number, month: number, day: number, zone: string): Date {
  const guess = Date.UTC(year, month - 1, day);
  // Correcting by the offset *at the guess* is accurate everywhere except the
  // hour a DST transition happens, which no supported zone schedules at midnight.
  return new Date(guess - zoneOffsetMs(new Date(guess), zone));
}

/**
 * The Monday a user joining at `at` begins on, in their own zone.
 *
 * Joining on a Monday starts that same day; any other day waits at most six.
 * Must stay in step with `GymWeek.weeklyStart(onOrAfter:)` in Swift.
 */
export function weeklyStart(at: Date, zone: string = DEFAULT_ZONE): Date {
  const tz = safeZone(zone);
  const local = new Date(at.getTime() + zoneOffsetMs(at, tz));
  const weekday = local.getUTCDay(); // 0 Sun, 1 Mon
  const daysAhead = weekday === 1 ? 0 : (8 - weekday) % 7;

  const target = new Date(local.getTime() + daysAhead * DAY_MS);
  return zoneMidnight(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    tz,
  );
}

/**
 * The Monday of the week `at` falls in, in `zone` — the start of the week that is
 * currently being scored.
 *
 * The counterpart to `weeklyStart`, which looks *forward* to the Monday a new
 * challenge would open on. Counting the workouts done so far this week needs the
 * Monday already behind you; the forward-looking one filters on a date in the
 * future and always counts zero.
 */
export function currentWeekStart(at: Date, zone: string = DEFAULT_ZONE): Date {
  const tz = safeZone(zone);
  const local = new Date(at.getTime() + zoneOffsetMs(at, tz));
  const weekday = local.getUTCDay(); // 0 Sun, 1 Mon
  // Weeks run Monday 00:00 to Sunday 23:59, so Sunday looks back six days.
  const daysBack = (weekday + 6) % 7;

  const target = new Date(local.getTime() - daysBack * DAY_MS);
  return zoneMidnight(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    tz,
  );
}

/** Whole weeks between two instants, rounded — used to preserve a challenge's length. */
export function weeksBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (7 * DAY_MS));
}

/** `start` advanced by whole weeks, landing on the same local wall-clock time. */
export function addWeeks(start: Date, weeks: number, zone: string = DEFAULT_ZONE): Date {
  const tz = safeZone(zone);
  const shifted = new Date(start.getTime() + weeks * 7 * DAY_MS);
  // Re-anchor to midnight so a DST change inside the window can't drift the end
  // date by an hour.
  const local = new Date(shifted.getTime() + zoneOffsetMs(shifted, tz));
  return zoneMidnight(
    local.getUTCFullYear(),
    local.getUTCMonth() + 1,
    local.getUTCDate(),
    tz,
  );
}
