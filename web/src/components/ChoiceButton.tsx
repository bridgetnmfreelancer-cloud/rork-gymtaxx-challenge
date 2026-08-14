import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A single tappable answer in the onboarding questions.
 *
 * Full-width and thumb-sized, with selection shown by an inverted fill rather
 * than a small radio dot. An optional `detail` line lets an answer name the
 * obstacle in one word and explain it underneath, so the list can be scanned at
 * a glance instead of read sentence by sentence.
 */
export function ChoiceButton({
  label,
  detail,
  isSelected,
  onSelect,
  delayMs = 0,
}: {
  label: string;
  detail?: string;
  isSelected: boolean;
  onSelect: () => void;
  delayMs?: number;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border-2 px-5 py-4 text-left transition-all active:scale-[0.99] animate-rise-in",
        isSelected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-transparent bg-card text-foreground hover:border-border",
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span className="min-w-0">
        <span className="block text-base font-semibold leading-snug">{label}</span>
        {detail ? (
          <span
            className={cn(
              "mt-1 block text-sm leading-snug",
              isSelected ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {detail}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          isSelected ? "border-accent bg-accent" : "border-border",
        )}
      >
        {isSelected ? <Check className="h-4 w-4 text-success-ink" aria-hidden="true" /> : null}
      </span>
    </button>
  );
}
