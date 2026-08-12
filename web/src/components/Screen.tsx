import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The single-column frame every screen sits in.
 *
 * Capped at phone width even on desktop: this is a phone app that happens to
 * run in a browser, and a full-width layout would immediately break that.
 */
export function Screen({
  children,
  className,
  withNav = false,
}: {
  children: ReactNode;
  className?: string;
  withNav?: boolean;
}) {
  return (
    <div className="min-h-full bg-background">
      <div
        className={cn(
          "mx-auto flex min-h-full w-full max-w-md flex-col px-5 pt-safe",
          withNav ? "pb-safe-nav" : "pb-safe",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Page heading, sized for the top of a phone screen. */
export function ScreenTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn("text-display text-foreground", className)}>{children}</h1>;
}

/** Supporting line under a heading. */
export function ScreenSubtitle({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-3 text-base leading-relaxed text-muted-foreground", className)}>{children}</p>;
}

/**
 * Sticky footer for the primary action, so the main button is always in thumb
 * reach rather than below a scroll.
 */
export function ScreenActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("sticky bottom-0 mt-auto bg-background pb-4 pt-4", className)}>{children}</div>;
}
