import { Compass, MoreHorizontal, Share, SquarePlus } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { Logo } from "@/components/Logo";
import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import { isInAppBrowser, isIOS } from "@/lib/pwa";

/**
 * An inline reproduction of a real browser button, so the instruction points at
 * something recognisable rather than describing it in words.
 */
function Chip({ icon: Icon, label }: { icon?: typeof Share; label: string }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 align-middle text-[0.9375rem] font-semibold leading-none text-foreground">
      {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

/** A round chip, matching how a browser renders its overflow menu button. */
function RoundChip({ icon: Icon, label }: { icon: typeof Share; label: string }) {
  return (
    <span
      className="mx-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card align-middle text-foreground"
      role="img"
      aria-label={label}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

const IOS_STEPS: ReactNode[] = [
  <>
    Press <RoundChip icon={Share} label="Share" /> in the Safari toolbar
  </>,
  <>
    Scroll down and select <Chip icon={SquarePlus} label="Add to Home Screen" />
  </>,
  <>
    Tap <Chip label="Add" /> in the top corner
  </>,
];

const ANDROID_STEPS: ReactNode[] = [
  <>
    Press <RoundChip icon={MoreHorizontal} label="Browser menu" /> to open the browser menu
  </>,
  <>
    Select <Chip icon={SquarePlus} label="Add to Home screen" />
  </>,
  <>
    Tap <Chip label="Add" /> to confirm
  </>,
];

/**
 * Step 2 of the funnel, and deliberately before the pitch.
 *
 * Installing first is what makes reminders possible for people who never pay —
 * on iPhone, push is only granted to an installed web app. The cost is real
 * drop-off here, so the page stays short and gives a way past.
 *
 * The steps name the exact buttons a person can see on screen. Earlier wording
 * invented an "Install app" button that does not exist in Safari, which is
 * worse than no instructions: it makes people think they are in the wrong place.
 */
export default function Install() {
  const navigate = useNavigate();
  const ios = isIOS();
  const embedded = isInAppBrowser();
  const steps = ios ? IOS_STEPS : ANDROID_STEPS;
  const host = typeof window === "undefined" ? "gymtaxx.com" : window.location.host;

  return (
    <Screen>
      <div className="mt-6 animate-rise-in">
        <ScreenTitle>Install the app</ScreenTitle>
        <ScreenSubtitle>Add GymTaxx to your {ios ? "Home Screen" : "home screen"} to get started.</ScreenSubtitle>
      </div>

      <div className="mt-6 flex items-center gap-4 rounded-xl border border-border bg-card p-4 animate-rise-in [animation-delay:60ms]">
        <Logo size={56} />
        <div className="min-w-0">
          <p className="font-extrabold leading-tight tracking-tight text-foreground">GymTaxx</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{host}</p>
        </div>
      </div>

      {embedded ? (
        <div className="mt-4 flex gap-3 rounded-lg border border-border p-4 animate-rise-in [animation-delay:100ms]">
          <Compass className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Open this in Safari first.</span> Tap the menu in the corner
            and choose "Open in browser" — you can't add to your Home Screen from inside this app.
          </p>
        </div>
      ) : null}

      <ol className="mt-7 space-y-5">
        {steps.map((step, index) => (
          <li
            key={index}
            className="flex items-baseline gap-3 animate-rise-in"
            style={{ animationDelay: `${140 + index * 70}ms` }}
          >
            <span className="tabular shrink-0 text-base font-bold text-muted-foreground">{index + 1}.</span>
            <p className="text-base leading-[2] text-foreground">{step}</p>
          </li>
        ))}
      </ol>

      <ScreenActions>
        <Button size="xl" className="w-full" onClick={() => navigate("/welcome")}>
          I've added GymTaxx
        </Button>
        <button
          type="button"
          className="mt-3 w-full py-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => navigate("/welcome?browser=1")}
        >
          Continue in browser
        </button>
      </ScreenActions>
    </Screen>
  );
}
