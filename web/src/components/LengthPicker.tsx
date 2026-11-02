import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { CHALLENGE_LENGTHS, depositFor, formatMoney, labelWeeks, type CurrencyCode } from "@/lib/money";
import { feeDueNow, formatFee, planById } from "@/lib/plans";

const ONE_CHALLENGE = planById("one_challenge");

/**
 * How long the challenge runs: 1, 2 or 4 weeks.
 *
 * Each option states both kinds of money up front, separated the way they are
 * separated everywhere else: the access fee (non-refundable, GymTaxx revenue)
 * and the deposit (refundable through workouts, the person's own money). The
 * deposit follows the goal chosen on the same screen, so the number in the
 * picker is the number the payment screen charges.
 *
 * Where this appears is entitlement-gated by the screens that host it: a
 * trial-eligible visitor meets the trial flow instead, so the picker is only
 * ever seen once the trial week is spent.
 */
export function LengthPicker({
  goal,
  currency,
  selected,
  onSelect,
}: {
  goal: number;
  currency: CurrencyCode;
  selected: number;
  onSelect: (weeks: (typeof CHALLENGE_LENGTHS)[number]) => void;
}) {
  return (
    <div className="space-y-2.5" role="radiogroup" aria-label="Challenge length">
      {CHALLENGE_LENGTHS.map((weeks, index) => {
        const isSelected = weeks === selected;
        const fee = feeDueNow(ONE_CHALLENGE, weeks);
        const deposit = depositFor(goal, weeks);
        return (
          <button
            key={weeks}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(weeks)}
            style={{ animationDelay: `${index * 60}ms` }}
            className={cn(
              "flex w-full items-center gap-4 rounded-lg border-2 px-5 py-4 text-left transition-all active:scale-[0.99] animate-rise-in",
              isSelected ? "border-primary bg-card" : "border-transparent bg-card hover:border-border",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                isSelected ? "border-primary bg-primary" : "border-border",
              )}
              aria-hidden="true"
            >
              {isSelected ? <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} /> : null}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block font-bold text-foreground">{labelWeeks(weeks)}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                {formatFee(fee, currency)} access · non-refundable
              </span>
            </span>

            <span className="shrink-0 text-right">
              {/* Keyed on the amount so changing the goal re-pops the number —
                  the same beat the commitment screen uses. */}
              <span key={deposit} className="tabular block font-extrabold leading-tight text-foreground animate-pop-in">
                {formatMoney(deposit, currency)}
              </span>
              <span className="block text-xs text-muted-foreground">deposit · refundable</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
