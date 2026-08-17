import { MoreHorizontal, Share, SquarePlus } from "lucide-react";
import { useEffect, useMemo, type ReactNode } from "react";
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

/**
 * A standalone swatch of the control, shown under its step.
 *
 * The Share button carries no label in Safari, so a written description alone
 * leaves someone scanning a toolbar for a word that isn't there.
 */
function ControlBox({ icon: Icon, label }: { icon: typeof Share; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 rounded-lg border border-border ${
        label ? "px-3.5 py-2.5" : "h-12 w-12 justify-center"
      }`}
      role="img"
      aria-label={label ?? "Share"}
    >
      <Icon className="h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
      {label ? <span className="text-base font-semibold text-foreground">{label}</span> : null}
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
 * Safari is step one rather than a subtitle. Watching someone open the page in
 * Chrome showed the cost of burying it: the steps described a Share button she
 * did not have, and it took nearly two minutes to work out why. The browser
 * requirement is the first thing that can be wrong, so it is now the first
 * thing read.
 *
 * Step three covers older iOS toolbars, where Share sits behind the overflow
 * menu instead of on the bar itself. People rarely know which layout they have,
 * so it is framed as a question they can answer by looking.
 *
 * iPhone only in v1 — Android arrives later via the Play Store, so there is no
 * second set of steps.
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

  const steps = useMemo<Step[]>(
    () => [
      {
        title: "Open this page in Safari",
        detail: (
          <p className="mt-1.5 text-base leading-relaxed text-muted-foreground">
            GymTaxx can only be installed from Safari on iPhone.
            {embedded ? ' Tap the menu in the corner and choose "Open in browser".' : ""}
          </p>
        ),
      },
      {
        title: (
          <>
            Tap the <span className="font-semibold">Share</span> button
          </>
        ),
        detail: (
          <span className="mt-2.5 block">
            <ControlBox icon={Share} />
          </span>
        ),
      },
      {
        title: "Don't see Share?",
        detail: (
          <p className="mt-1.5 text-base leading-loose text-muted-foreground">
            Tap <RoundChip icon={MoreHorizontal} label="Browser menu" />, then <Chip label="View more" /> to find it.
          </p>
        ),
      },
      {
        title: (
          <>
            Tap <span className="font-semibold">Add to Home Screen</span>
          </>
        ),
        detail: (
          <span className="mt-2.5 block">
            <ControlBox icon={SquarePlus} label="Add to Home Screen" />
          </span>
        ),
      },
    ],
    [embedded],
  );

  return (
    <Screen>
      <div className="mt-6 animate-rise-in">
        <ScreenTitle>Install the app</ScreenTitle>
      </div>

      <ol className="mt-8 space-y-7">
        {steps.map((step, index) => (
          <li
            key={index}
            className="flex gap-3 animate-rise-in"
            style={{ animationDelay: `${80 + index * 70}ms` }}
          >
            <span className="tabular shrink-0 text-base font-bold text-muted-foreground">{index + 1}.</span>
            <div className="min-w-0">
              <p className="text-base leading-snug text-foreground">{step.title}</p>
              {step.detail}
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
