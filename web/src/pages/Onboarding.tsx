import { Banknote, Camera, Target, XCircle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ChoiceButton } from "@/components/ChoiceButton";
import { FourWeekCalendar } from "@/components/FourWeekCalendar";
import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { flowProgress } from "@/lib/flow";
import {
  CHALLENGE_WEEKS,
  currencyForRegion,
  formatMoney,
  REWARD_PER_WORKOUT,
  WEEKLY_GOALS,
  type WeeklyGoal,
} from "@/lib/money";
import {
  BLOCKER_OPTIONS,
  HABIT_OPTIONS,
  MOTIVATION_OPTIONS,
  STRUGGLING_OPTIONS,
  habitPerWeek,
  loadAnswers,
  saveAnswers,
  type BlockerId,
  type HabitId,
  type MotivationId,
  type OnboardingAnswers,
  type StrugglingId,
} from "@/lib/onboarding";

type Stage = "problem" | "mechanism" | "habit" | "goal" | "blocker" | "motivation" | "struggling" | "summary";

const ORDER: Stage[] = ["problem", "mechanism", "habit", "goal", "blocker", "motivation", "struggling", "summary"];

/**
 * Where to pick the conversation back up.
 *
 * Someone who reaches the reminder ask and then taps back has already answered
 * everything; dropping them at the opening screen would make the back button
 * read as "start again". The saved answers already say how far they got, so the
 * resume point is derived from those rather than stored separately — which also
 * covers a phone that was locked half way through and reopened later.
 */
function resumeStage(answers: OnboardingAnswers): Stage {
  if (answers.struggling !== null) return "summary";
  if (answers.motivation !== null) return "struggling";
  if (answers.blocker !== null) return "motivation";
  if (answers.goal !== null) return "blocker";
  if (answers.habit !== null) return "goal";
  return "problem";
}

/**
 * The whole persuasion run, before anyone is asked for an account.
 *
 * Deliberately anonymous. Account creation used to sit at the top of this, which
 * asked strangers to hand over an email before they had any reason to want one;
 * it now sits at the far end, after they have named their goal, seen the gap
 * they're living with, and chosen what to put behind closing it.
 *
 * Held in one component because moving between these should feel like a single
 * continuous conversation rather than eight page loads. The answers are written
 * to local storage as they go, so a phone that gets locked half way through
 * comes back to the same place.
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => loadAnswers());
  const [stage, setStage] = useState<Stage>(() => resumeStage(loadAnswers()));

  const index = ORDER.indexOf(stage);

  const update = useCallback((patch: Partial<OnboardingAnswers>): void => {
    setAnswers((current) => {
      const next = { ...current, ...patch };
      saveAnswers(next);
      return next;
    });
  }, []);

  const goBack = useCallback((): void => {
    setStage((current) => {
      const at = ORDER.indexOf(current);
      return at <= 0 ? current : ORDER[at - 1];
    });
  }, []);

  const goNext = useCallback((): void => {
    setStage((current) => {
      const at = ORDER.indexOf(current);
      return at >= ORDER.length - 1 ? current : ORDER[at + 1];
    });
  }, []);

  /** Advancing on tap keeps the questions feeling quick; no Continue button. */
  const chooseAndAdvance = useCallback(
    (patch: Partial<OnboardingAnswers>): void => {
      update(patch);
      window.setTimeout(goNext, 220);
    },
    [update, goNext],
  );

  const currentPerWeek = useMemo(() => habitPerWeek(answers.habit), [answers.habit]);
  const goalPerWeek = answers.goal ?? 4;

  /**
   * Priced from the browser's region, the same way the participation record is
   * priced when they join — so the amount shown here can never contradict what
   * they are later charged.
   */
  const currency = useMemo(() => currencyForRegion(), []);

  return (
    <Screen>
      <StepProgress {...flowProgress(stage)} onBack={index === 0 ? null : goBack} />

      {stage === "problem" ? (
        // The whole panel is the control. There is nothing to decide here, and a
        // button would imply there was.
        <button
          type="button"
          onClick={goNext}
          className="flex flex-1 flex-col text-left active:opacity-70 transition-opacity"
        >
          <div className="pt-10">
            <p className="text-display leading-[1.1] text-foreground animate-rise-in">
              You know how you've been telling yourself you'll be consistent with the gym, but somehow it never happens?
            </p>
            <p className="mt-8 text-2xl font-semibold leading-snug text-foreground animate-rise-in [animation-delay:700ms]">
              You're not alone.
            </p>
            <p className="mt-3 text-2xl font-semibold leading-snug text-muted-foreground animate-rise-in [animation-delay:1100ms]">
              90% of people stop going to the gym consistently after only 3 months.
            </p>
          </div>

          <span className="mt-auto py-8 text-center text-sm font-medium text-muted-foreground animate-rise-in [animation-delay:1900ms]">
            Tap to continue
          </span>
        </button>
      ) : null}

      {stage === "mechanism" ? (
        <div className="flex flex-1 flex-col">
          <div className="pt-8">
            <ScreenTitle className="animate-rise-in">GymTaxx makes sure you never skip a workout</ScreenTitle>
            <ScreenSubtitle className="animate-rise-in [animation-delay:80ms]">How it works</ScreenSubtitle>
          </div>

          <ol className="mt-8 space-y-3">
            <MechanismStep
              icon={Target}
              title="Set a gym goal"
              detail="3, 4 or 5 workouts a week for a month"
              delayMs={160}
            />
            <MechanismStep
              icon={Banknote}
              title="Put money behind it"
              detail={`${formatMoney(REWARD_PER_WORKOUT, currency)} a workout`}
              delayMs={260}
            />
            <MechanismStep
              icon={Camera}
              title={`Log a workout, get ${formatMoney(REWARD_PER_WORKOUT, currency)} back`}
              delayMs={360}
            />
            <MechanismStep
              icon={XCircle}
              title={`Skip a workout, lose ${formatMoney(REWARD_PER_WORKOUT, currency)}`}
              delayMs={460}
            />
          </ol>

          <ScreenActions className="animate-rise-in [animation-delay:600ms]">
            <Button size="xl" className="w-full" onClick={goNext}>
              Continue
            </Button>
          </ScreenActions>
        </div>
      ) : null}

      {stage === "habit" ? (
        <Question
          key="habit"
          title="How many times do you usually go to the gym?"
          options={HABIT_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
          selected={answers.habit}
          onSelect={(id) => chooseAndAdvance({ habit: id as HabitId })}
        />
      ) : null}

      {stage === "goal" ? (
        <Question
          key="goal"
          title="How many times would you like to go to the gym?"
          subtitle="This becomes your weekly goal. You can change it before you commit."
          options={WEEKLY_GOALS.map((goal) => ({
            id: String(goal),
            label: goal === 5 ? "5 or more times per week" : `${goal} times per week`,
          }))}
          selected={answers.goal === null ? null : String(answers.goal)}
          onSelect={(id) => chooseAndAdvance({ goal: Number(id) as WeeklyGoal })}
        />
      ) : null}

      {stage === "blocker" ? (
        <Question
          key="blocker"
          title="What's stopping you from reaching your goals?"
          options={BLOCKER_OPTIONS.map((option) => ({ id: option.id, label: option.label, detail: option.detail }))}
          selected={answers.blocker}
          onSelect={(id) => chooseAndAdvance({ blocker: id as BlockerId })}
        />
      ) : null}

      {stage === "motivation" ? (
        <Question
          key="motivation"
          title="Why does being consistent with the gym matter to you?"
          options={MOTIVATION_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
          selected={answers.motivation}
          onSelect={(id) => chooseAndAdvance({ motivation: id as MotivationId })}
        />
      ) : null}

      {stage === "struggling" ? (
        <Question
          key="struggling"
          title="How long have you been trying to be consistent?"
          options={STRUGGLING_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            detail: option.detail,
          }))}
          selected={answers.struggling}
          onSelect={(id) => chooseAndAdvance({ struggling: id as StrugglingId })}
        />
      ) : null}

      {stage === "summary" ? (
        <div className="flex flex-1 flex-col">
          <div className="pt-8">
            <ScreenTitle className="animate-rise-in">This can change today.</ScreenTitle>
            <ScreenSubtitle className="animate-rise-in [animation-delay:60ms]">
              Your next {CHALLENGE_WEEKS} weeks could look like this.
            </ScreenSubtitle>
          </div>

          <div className="mt-8">
            <FourWeekCalendar currentPerWeek={currentPerWeek} goalPerWeek={goalPerWeek} />
          </div>

          <ScreenActions className="animate-rise-in [animation-delay:420ms]">
            <Button size="xl" className="w-full" onClick={() => navigate("/reminders")}>
              Continue
            </Button>
          </ScreenActions>
        </div>
      ) : null}
    </Screen>
  );
}

function Question({
  title,
  subtitle,
  options,
  selected,
  onSelect,
}: {
  title: string;
  /** Optional — a question that needs no framing shouldn't carry filler. */
  subtitle?: string;
  options: { id: string; label: string; detail?: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="pt-8">
        <ScreenTitle className="animate-rise-in">{title}</ScreenTitle>
        {subtitle ? (
          <ScreenSubtitle className="animate-rise-in [animation-delay:60ms]">{subtitle}</ScreenSubtitle>
        ) : null}
      </div>

      <div className="mt-8 space-y-3">
        {options.map((option, position) => (
          <ChoiceButton
            key={option.id}
            label={option.label}
            detail={option.detail}
            isSelected={selected === option.id}
            onSelect={() => onSelect(option.id)}
            delayMs={100 + position * 60}
          />
        ))}
      </div>
    </div>
  );
}

function MechanismStep({
  icon: Icon,
  title,
  detail,
  delayMs,
}: {
  icon: typeof Banknote;
  title: string;
  /** Optional second line — the concrete detail behind the step. */
  detail?: string;
  delayMs: number;
}) {
  return (
    <li
      className="flex items-center gap-4 rounded-lg bg-card p-4 animate-rise-in"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary">
        <Icon className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-base font-semibold leading-snug text-foreground">{title}</p>
        {detail ? <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{detail}</p> : null}
      </div>
    </li>
  );
}
