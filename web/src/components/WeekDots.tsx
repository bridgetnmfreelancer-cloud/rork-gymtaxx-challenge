import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The week at a glance: one mark per required workout.
 *
 * Verified reads as banked (filled mint), pending as claimed-but-not-yet-yours
 * (outlined), and the rest as still owed. Three states rather than two, because
 * every workout waits on review before it earns anything.
 */
export function WeekDots({
  goal,
  verified,
  pending,
}: {
  goal: number;
  verified: number;
  pending: number;
}) {
  const marks = Array.from({ length: goal }, (_, index) => {
    if (index < verified) return "verified" as const;
    if (index < verified + pending) return "pending" as const;
    return "empty" as const;
  });

  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${verified} of ${goal} workouts verified this week`}>
      {marks.map((mark, index) => (
        <div
          key={index}
          className={cn(
            "flex h-11 flex-1 items-center justify-center rounded-md border-2 transition-all duration-500",
            mark === "verified" && "border-accent bg-accent",
            mark === "pending" && "border-accent border-dashed bg-transparent",
            mark === "empty" && "border-border bg-card",
          )}
          style={{ transitionDelay: `${index * 60}ms` }}
        >
          {mark === "verified" ? (
            <Check className="h-5 w-5 text-success-ink animate-pop-in" strokeWidth={3} aria-hidden="true" />
          ) : null}
          {mark === "pending" ? <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
}
