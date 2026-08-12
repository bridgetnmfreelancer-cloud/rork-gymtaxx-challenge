/**
 * Week boundaries, mirroring `backend/functions/_shared/gymweek.ts` and
 * `GymWeek.swift`.
 *
 * Challenges open on Mondays at 00:00 in the participant's *own* time zone,
 * fixed when they join. Getting this wrong shifts a start date by hours, or by a
 * whole day for someone joining on a Sunday evening in California — which is
 * exactly when TikTok traffic peaks.
 *
 * These three implementations must stay in step.
 */

/** The zone every pre-1.1 challenge ran on, and the fallback for bad input. */
export const DEFAULT_ZONE = "Europe/London";

const DAY_MS = 86_400_000;

/** A stored zone we can safely hand to `Intl`. */
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

/** The browser's current zone, used to fix a new joiner's schedule. */
export function currentZone(): string {
  return safeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
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

  const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? "0");

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
  return new Date(guess - zoneOffsetMs(new Date(guess), zone));
}

/**
 * The Monday a user joining at `at` begins on, in their own zone.
 * Joining on a Monday starts that same day; any other day waits at most six.
 */
export function weeklyStart(at: Date, zone: string = DEFAULT_ZONE): Date {
  const tz = safeZone(zone);
  const local = new Date(at.getTime() + zoneOffsetMs(at, tz));
  const weekday = local.getUTCDay(); // 0 Sun, 1 Mon
  const daysAhead = weekday === 1 ? 0 : (8 - weekday) % 7;

  const target = new Date(local.getTime() + daysAhead * DAY_MS);
  return zoneMidnight(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), tz);
}

/** `start` advanced by whole weeks, landing on the same local wall-clock time. */
export function addWeeks(start: Date, weeks: number, zone: string = DEFAULT_ZONE): Date {
  const tz = safeZone(zone);
  const shifted = new Date(start.getTime() + weeks * 7 * DAY_MS);
  const local = new Date(shifted.getTime() + zoneOffsetMs(shifted, tz));
  return zoneMidnight(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(), tz);
}

/** Whole weeks between two instants, rounded. */
export function weeksBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (7 * DAY_MS));
}

/**
 * Which week of the challenge `at` falls in, 1-based and clamped to the
 * challenge length so a late viewer never sees "week 5 of 4".
 */
export function weekIndex(start: Date, at: Date, totalWeeks: number): number {
  const elapsed = Math.floor((at.getTime() - start.getTime()) / (7 * DAY_MS));
  return Math.min(Math.max(elapsed + 1, 1), totalWeeks);
}

/** Start (inclusive) and end (exclusive) of the week `at` falls in. */
export function weekBounds(start: Date, at: Date, totalWeeks: number, zone: string): { from: Date; to: Date } {
  const index = weekIndex(start, at, totalWeeks);
  const from = addWeeks(start, index - 1, zone);
  return { from, to: addWeeks(start, index, zone) };
}

/** "Monday 17 August" — the start date as people actually read it. */
export function formatStartDate(date: Date, zone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: safeZone(zone),
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}
