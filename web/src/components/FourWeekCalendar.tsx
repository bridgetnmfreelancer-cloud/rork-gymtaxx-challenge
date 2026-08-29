import { cn } from "@/lib/utils";

/**
 * Which days of a week get worked, per weekly goal.
 *
 * Spread rather than clumped, because a run of three consecutive filled squares
 * followed by four empty ones reads as a burst of effort and a collapse — the
 * exact opposite of the consistency being sold. Index 0 is Monday.
 */
const PATTERN: Record<number, number[]> = {
  0: [],
  1: [1],
  2: [1, 4],
  3: [0, 2, 4],
  4: [0, 1, 3, 5],
  5: [0, 1, 2, 4, 5],
};

const WEEKS = 4;
const DAYS_IN_WEEK = 7;

function daysFor(perWeek: number): number[] {
  return PATTERN[Math.max(0, Math.min(5, Math.round(perWeek)))] ?? [];
}

/**
 * One side of the comparison: four weeks of squares, filled on workout days.
 *
 * Deliberately not a real calendar. Dates would invite people to check them
 * against today, and the point being made is about rhythm rather than any
 * particular Tuesday.
 */
function Grid({ perWeek, tone }: { perWeek: number; tone: "before" | "after" }) {
  const workoutDays = daysFor(perWeek);
  const isAfter = tone === "after";

  return (
    <div className="grid grid-cols-7 gap-[3px]" aria-hidden="true">
      {Array.from({ length: WEEKS * DAYS_IN_WEEK }, (_, cell) => {
        const day = cell % DAYS_IN_WEEK;
        const week = Math.floor(cell / DAYS_IN_WEEK);
        const isWorkout = workoutDays.includes(day);
        return (
          <span
            key={cell}
            className={cn(
              "aspect-square rounded-[3px] transition-colors",
              isWorkout
                ? isAfter
                  ? "bg-success-ink"
                  : "bg-muted-foreground/45"
                : isAfter
                  ? "bg-success-ink/12"
                  : "bg-muted-foreground/12",
            )}
            style={isAfter && isWorkout ? { animationDelay: `${240 + (week * DAYS_IN_WEEK + day) * 14}ms` } : undefined}
          />
        );
      })}
    </div>
  );
}

function Side({
  heading,
  perWeek,
  caption,
  tone,
  delayMs,
}: {
  heading: string;
  perWeek: number;
  caption: string;
  tone: "before" | "after";
  delayMs: number;
}) {
  const isAfter = tone === "after";
  const total = Math.round(perWeek) * WEEKS;

  return (
    <div
      className={cn(
        "flex flex-1 flex-col rounded-xl border p-3 animate-rise-in",
        isAfter ? "border-success-ink/25 bg-accent/25" : "border-border bg-card",
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <p className={cn("text-xs font-semibold", isAfter ? "text-success-ink" : "text-muted-foreground")}>{heading}</p>

      <div className="mt-3">
        <Grid perWeek={perWeek} tone={tone} />
      </div>

      <p className="mt-3">
        <span className={cn("tabular text-2xl font-extrabold leading-none", isAfter ? "text-success-ink" : "text-muted-foreground")}>
          {total}
        </span>
        <span className={cn("ml-1 text-xs font-medium", isAfter ? "text-success-ink/80" : "text-muted-foreground")}>
          {total === 1 ? "workout" : "workouts"}
        </span>
      </p>

      <p className={cn("mt-2 text-xs leading-snug", isAfter ? "text-foreground" : "text-muted-foreground")}>{caption}</p>
    </div>
  );
}

/**
 * The next four weeks, twice: the rate they said they manage now, against the
 * rate they just said they want.
 *
 * This is the pivot of the whole flow — the first moment the gap between those
 * two answers is something they can see rather than something they'd have to
 * work out. Everything before it collects the two numbers; everything after it
 * asks them to close the gap.
 */
export function FourWeekCalendar({ currentPerWeek, goalPerWeek }: { currentPerWeek: number; goalPerWeek: number }) {
  return (
    <div className="flex gap-3">
      <Side
        heading="Without GymTaxx"
        perWeek={currentPerWeek}
        caption="Same method. No progress. Same you."
        tone="before"
        delayMs={140}
      />
      <Side
        heading="With GymTaxx"
        perWeek={goalPerWeek}
        caption="New method. Real progress. New you."
        tone="after"
        delayMs={260}
      />
    </div>
  );
}
