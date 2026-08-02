/**
 * Week boundaries, mirroring `GymWeek.swift` on the client.
 *
 * Challenges open on Mondays at 00:00 London time. Deno has no timezone-aware
 * date type, so we derive London wall-clock time from `Intl` rather than
 * assuming UTC — getting this wrong would shift every start date by an hour
 * for half the year.
 */

const ZONE = "Europe/London";
const DAY_MS = 86_400_000;

/** How far London is ahead of UTC at a given instant, in milliseconds. */
function zoneOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
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

/** The instant of 00:00 London time on the given London calendar date. */
function zoneMidnight(year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day);
  // Correcting by the offset *at the guess* is accurate everywhere except the
  // hour a DST transition happens, which never lands on midnight in London.
  return new Date(guess - zoneOffsetMs(new Date(guess)));
}

/**
 * The Monday a user joining at `at` begins on.
 *
 * Joining on a Monday starts that same day; any other day waits at most six.
 * Must stay in step with `GymWeek.weeklyStart(onOrAfter:)` in Swift.
 */
export function weeklyStart(at: Date): Date {
  const local = new Date(at.getTime() + zoneOffsetMs(at));
  const weekday = local.getUTCDay(); // 0 Sun, 1 Mon
  const daysAhead = weekday === 1 ? 0 : (8 - weekday) % 7;

  const target = new Date(local.getTime() + daysAhead * DAY_MS);
  return zoneMidnight(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
  );
}

/** Whole weeks between two instants, rounded — used to preserve a challenge's length. */
export function weeksBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (7 * DAY_MS));
}

/** `start` advanced by whole weeks, landing on the same London wall-clock time. */
export function addWeeks(start: Date, weeks: number): Date {
  const shifted = new Date(start.getTime() + weeks * 7 * DAY_MS);
  // Re-anchor to midnight so a DST change inside the window can't drift the end
  // date by an hour.
  const local = new Date(shifted.getTime() + zoneOffsetMs(shifted));
  return zoneMidnight(
    local.getUTCFullYear(),
    local.getUTCMonth() + 1,
    local.getUTCDate(),
  );
}
