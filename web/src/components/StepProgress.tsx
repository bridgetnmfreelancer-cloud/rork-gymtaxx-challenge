import { ChevronLeft } from "lucide-react";

/** Header for a multi-step flow: a back arrow and a filling progress bar. */
export function StepProgress({
  step,
  total,
  onBack,
}: {
  step: number;
  total: number;
  onBack: (() => void) | null;
}) {
  const percent = Math.round((step / total) * 100);

  return (
    <div className="flex items-center gap-3 py-2">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-card"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
        </button>
      ) : (
        <div className="h-10 w-2 shrink-0" />
      )}

      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-card"
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Step ${step} of ${total}`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
