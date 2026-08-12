import { useEffect, useRef, useState } from "react";

import { currencySymbol, type CurrencyCode } from "@/lib/money";

/**
 * A money figure that counts up to its new value.
 *
 * This is the payoff moment of the whole product — the number going up is the
 * reward for having gone to the gym — so it animates rather than snapping.
 */
export function CountUpMoney({
  value,
  currency,
  className,
  durationMs = 900,
}: {
  value: number;
  currency: CurrencyCode;
  className?: string;
  durationMs?: number;
}) {
  const [shown, setShown] = useState<number>(value);
  const fromRef = useRef<number>(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;

    // Respect a user who has asked the OS for less motion.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      fromRef.current = value;
      setShown(value);
      return;
    }

    const started = performance.now();

    const step = (now: number): void => {
      const elapsed = now - started;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease out, so it decelerates into the final figure.
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(from + (value - from) * eased));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
      }
    };

    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value, durationMs]);

  return (
    <span className={className}>
      {currencySymbol(currency)}
      <span className="tabular">{shown.toLocaleString("en-GB")}</span>
    </span>
  );
}
