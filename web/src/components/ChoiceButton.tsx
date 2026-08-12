import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A single tappable answer in the onboarding questions.
 *
 * Full-width and 60px tall so it's comfortably thumb-sized, with selection
 * shown by an inverted fill rather than a small radio dot.
 */
export function ChoiceButton({
  label,
  isSelected,
  onSelect,
  delayMs = 0,
}: {
  label: string;
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
      <span className="text-base font-medium leading-snug">{label}</span>
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
