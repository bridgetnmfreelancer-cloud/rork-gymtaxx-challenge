import { ArrowUpFromLine, Bell, Compass, Plus, SquarePlus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Logo, Wordmark } from "@/components/Logo";
import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import { isInAppBrowser, isIOS } from "@/lib/pwa";

type Step = {
  icon: typeof ArrowUpFromLine;
  title: string;
  detail: string;
};

const IOS_STEPS: Step[] = [
  { icon: ArrowUpFromLine, title: "Tap Share", detail: "The square with an arrow, at the bottom of Safari." },
  { icon: SquarePlus, title: 'Tap "Add to Home Screen"', detail: "Scroll down the list if you can't see it." },
  { icon: Plus, title: 'Tap "Add"', detail: "Top right. GymTaxx lands on your Home Screen." },
];

const ANDROID_STEPS: Step[] = [
  { icon: ArrowUpFromLine, title: "Open the browser menu", detail: "The three dots, top right." },
  { icon: SquarePlus, title: 'Tap "Install app"', detail: 'Sometimes called "Add to Home screen".' },
  { icon: Plus, title: "Confirm", detail: "GymTaxx lands on your home screen." },
];

/**
 * Step 2 of the funnel, and deliberately before the pitch.
 *
 * Installing first is what makes reminders possible for people who never pay —
 * on iPhone, push is only granted to an installed web app. The cost is real
 * drop-off here, so the page stays short and gives a way past.
 */
export default function Install() {
  const navigate = useNavigate();
  const ios = isIOS();
  const embedded = isInAppBrowser();
  const steps = ios ? IOS_STEPS : ANDROID_STEPS;

  return (
    <Screen>
      <div className="flex flex-col items-center pt-10 text-center animate-rise-in">
        <Logo size={72} />
        <Wordmark className="mt-4" />
      </div>

      <div className="mt-8 animate-rise-in [animation-delay:60ms]">
        <ScreenTitle>Add GymTaxx to your {ios ? "iPhone" : "phone"}</ScreenTitle>
        <ScreenSubtitle>
          Install it so it's always on your Home Screen, and so we can remind you when you're falling behind.
        </ScreenSubtitle>
      </div>

      {embedded ? (
        <div className="mt-6 flex gap-3 rounded-lg border border-border bg-card p-4 animate-rise-in [animation-delay:100ms]">
          <Compass className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Open this in Safari first.</span> Tap the menu in the corner
            and choose "Open in browser" — you can't add to your Home Screen from inside this app.
          </p>
        </div>
      ) : null}

      <ol className="mt-8 space-y-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex items-start gap-4 rounded-lg bg-card p-4 animate-rise-in"
            style={{ animationDelay: `${140 + index * 70}ms` }}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary">
              <step.icon className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold leading-tight text-foreground">
                <span className="tabular text-muted-foreground">{index + 1}. </span>
                {step.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex items-center gap-3 rounded-lg border border-border p-4 animate-rise-in [animation-delay:360ms]">
        <Bell className="h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Reminders only work once GymTaxx is on your Home Screen.
        </p>
      </div>

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
