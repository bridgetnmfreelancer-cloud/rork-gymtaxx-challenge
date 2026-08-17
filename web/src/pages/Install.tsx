import { MoreHorizontal, Share, SquarePlus } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { Screen, ScreenActions, ScreenTitle } from "@/components/Screen";
import { isInAppBrowser } from "@/lib/pwa";
import { recordVisit } from "@/lib/visitor";

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

/** A round chip, matching how Safari renders its overflow menu button. */
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

/** The Share button drawn on its own, since it carries no label in Safari. */
function ShareButton() {
  return (
    <span
      className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-card text-foreground"
      role="img"
      aria-label="Share"
    >
      <Share className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

type Step = { title: ReactNode; detail?: ReactNode };

/**
 * Step 2 of the funnel, and deliberately before the pitch.
 *
 * Installing first is what makes reminders possible for people who never pay —
 * on iPhone, push is only granted to an installed web app. The cost is real
 * drop-off here, so the page stays short and gives a way past.
 *
 * Safari leads as step one because watching a real person use this showed the
 * wrong-browser problem is the expensive one: it isn't that the steps are hard,
 * it's that in Chrome they describe buttons that do not exist, and nothing on
 * screen says why. That has to be the first thing read, not a footnote.
 *
 * Steps 2 and 3 are split for the same reason. Safari moved the Share button
 * into an overflow menu on newer iPhones, but plenty of people are still on the
 * older layout with Share in the middle of the toolbar. One combined
 * instruction is wrong for whichever half is reading it, so the common case
 * leads and the menu route is offered to anyone who can't find it.
 *
 * There is deliberately no "I've installed it" button: adding to the Home
 * Screen drops the person onto their Home Screen, so a confirm button would sit
 * on a page nobody is looking at any more.
 */
export default function Install() {
  const navigate = useNavigate();
  const embedded = isInAppBrowser();

  // The step with no completion signal — finishing an install closes this page
  // rather than advancing it. Counting arrivals here is what makes the size of
  // the loss measurable at all.
  useEffect(() => {
    void recordVisit("install");
  }, []);

  const steps: Step[] = [
    {
      title: "Open this page in Safari",
      detail: embedded ? (
        // Inside TikTok or Instagram there is no Add to Home Screen at all, so
        // naming their menu is the only instruction that can work here.
        <>
          Tap the menu in the corner and choose "Open in browser". GymTaxx can only be installed from Safari on iPhone.
        </>
      ) : (
        <>GymTaxx can only be installed from Safari on iPhone.</>
      ),
    },
    {
      title: (
        <>
          Tap the <strong className="font-bold">Share</strong> button
        </>
      ),
      detail: <ShareButton />,
    },
    {
      title: "Don't see Share?",
      detail: (
        <>
          Tap <RoundChip icon={MoreHorizontal} label="Browser menu" />, then <Chip label="View more" /> to find it.
        </>
      ),
    },
    {
      title: (
        <>
          Tap <strong className="font-bold">Add to Home Screen</strong>
        </>
      ),
      detail: <Chip icon={SquarePlus} label="Add to Home Screen" />,
    },
  ];

  return (
    <Screen>
      <div className="mt-6 animate-rise-in">
        <ScreenTitle>Install the app</ScreenTitle>
      </div>

      <ol className="mt-8 space-y-7">
        {steps.map((step, index) => (
          <li
            key={index}
            className="flex items-baseline gap-3 animate-rise-in"
            style={{ animationDelay: `${60 + index * 70}ms` }}
          >
            <span className="tabular shrink-0 text-base font-bold text-muted-foreground">{index + 1}.</span>
            <div className="min-w-0">
              <p className="text-lg leading-snug text-foreground">{step.title}</p>
              {step.detail ? (
                <div className="mt-2 text-base leading-[1.9] text-muted-foreground">{step.detail}</div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <ScreenActions>
        <button
          type="button"
          className="w-full py-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => navigate("/welcome?browser=1")}
        >
          Continue in browser
        </button>
      </ScreenActions>
    </Screen>
  );
}
