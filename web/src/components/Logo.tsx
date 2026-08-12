import { cn } from "@/lib/utils";

/**
 * The GymTaxx mark: a navy tile with a mint tick cut through it.
 * Drawn rather than loaded so it renders instantly on the install page, which is
 * the very first thing a paid visitor sees.
 */
export function Logo({ className, size = 64 }: { className?: string; size?: number }) {
  return (
    <div
      className={cn("flex items-center justify-center rounded-[28%] bg-primary shadow-lg shadow-primary/20", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" style={{ width: size * 0.56, height: size * 0.56 }}>
        <path
          d="M4 12.8L9.2 18L20 6.5"
          stroke="hsl(var(--accent))"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-xl font-extrabold tracking-tight text-foreground", className)}>
      GYM<span className="text-muted-foreground">TAXX</span>
    </span>
  );
}
