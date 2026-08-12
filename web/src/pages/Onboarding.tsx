import { Banknote, Camera, Target, Trophy } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ChoiceButton } from "@/components/ChoiceButton";
import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { currencyForRegion, currencySymbol, REWARD_PER_WORKOUT, WEEKLY_GOALS, type WeeklyGoal } from "@/lib/money";
import {
  BLOCKER_OPTIONS,
  HABIT_OPTIONS,
  blockerById,
  habitById,
  loadAnswers,
  saveAnswers,
  type BlockerId,
  type HabitId,
  type OnboardingAnswers,
} from "@/lib/onboarding";

type Stage = "habit" | "goal" | "blocker" | "result" | "how";

const ORDER: Stage[] = ["habit", "goal", "blocker", "result", "how"];

/**
 * Steps 5 to 7 of the funnel: three questions, the answers read back, and how
 * GymTaxx works.
 *
 * Held in one component because the mirror screen needs every answer at once,
 * and because moving between them should feel like one continuous flow rather
 * than five page loads.
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => loadAnswers());
  const [stage, setStage] = useState<Stage>("habit");

  const symbol = currencySymbol(currencyForRegion());
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

  const mirror = useMemo(() => {
    const habit = habitById(answers.habit);
    const blocker = blockerById(answers.blocker);
    return {
      goal: answers.goal ?? 4,
      current: habit?.approxPerWeek ?? 0,
      line: blocker?.mirror ?? "What you've tried hasn't closed that gap.",
    };
  }, [answers]);

  return (
    <Screen>
      <StepProgress step={index + 1} total={ORDER.length} onBack={index === 0 ? null : goBack} />

      {stage === "habit" ? (
        <Question
          key="habit"
          title="How often are you training right now?"
          subtitle="Be honest — this only works if the starting point is real."
          options={HABIT_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
          selected={answers.habit}
          onSelect={(id) => chooseAndAdvance({ habit: id as HabitId })}
        />
      ) : null}

      {stage === "goal" ? (
        <Question
          key="goal"
          title="How often do you want to go?"
          subtitle="This becomes your weekly goal. You can change it before you commit."
          options={WEEKLY_GOALS.map((goal) => ({ id: String(goal), label: `${goal} times a week` }))}
          selected={answers.goal === null ? null : String(answers.goal)}
          onSelect={(id) => chooseAndAdvance({ goal: Number(id) as WeeklyGoal })}
        />
      ) : null}

      {stage === "blocker" ? (
        <Question
          key="blocker"
          title="What usually gets in the way?"
          subtitle="Whatever it is, it's beaten you before now."
          options={BLOCKER_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
          selected={answers.blocker}
          onSelect={(id) => chooseAndAdvance({ blocker: id as BlockerId })}
        />
      ) : null}

      {stage === "result" ? (
        <div className="flex flex-1 flex-col">
          <div className="pt-10">
            <p className="text-display leading-[1.1] text-foreground animate-rise-in">
              You want to train{" "}
              <span className="tabular rounded-md bg-accent px-2 text-success-ink">{mirror.goal}&times;</span> a week.
            </p>
            <p className="mt-6 text-2xl font-semibold leading-snug text-foreground animate-rise-in [animation-delay:400ms]">
              {mirror.current === 0 ? (
                <>Right now you're not going at all.</>
              ) : (
                <>
                  Right now you're averaging <span className="tabular">{mirror.current}&times;</span>.
                </>
              )}
            </p>
            <p className="mt-6 text-2xl font-semibold leading-snug text-muted-foreground animate-rise-in [animation-delay:800ms]">
              {mirror.line}
            </p>
            <p className="mt-10 text-xl font-bold leading-snug text-foreground animate-rise-in [animation-delay:1200ms]">
              That's where GymTaxx comes in.
            </p>
          </div>

          <ScreenActions className="animate-rise-in [animation-delay:1400ms]">
            <Button size="xl" className="w-full" onClick={goNext}>
              Show me how
            </Button>
          </ScreenActions>
        </div>
      ) : null}

      {stage === "how" ? (
        <div className="flex flex-1 flex-col">
          <div className="pt-8">
            <ScreenTitle className="animate-rise-in">How GymTaxx works</ScreenTitle>
            <ScreenSubtitle className="animate-rise-in [animation-delay:60ms]">
              Four steps. No catch in the small print.
            </ScreenSubtitle>
          </div>

          <ol className="mt-8 space-y-3">
            <HowStep
              icon={Target}
              index={1}
              title="Choose your weekly goal"
              detail="Three, four or five workouts a week for four weeks."
              delayMs={120}
            />
            <HowStep
              icon={Banknote}
              index={2}
              title={`Put ${symbol}${REWARD_PER_WORKOUT} behind each workout`}
              detail="Your own money, held up front. That's what makes it real."
              delayMs={200}
            />
            <HowStep
              icon={Camera}
              index={3}
              title="Verify each workout"
              detail="A quick photo from the gym, stamped with the time and place."
              delayMs={280}
            />
            <HowStep
              icon={Trophy}
              index={4}
              title="Complete your goal, earn it back"
              detail={`Every workout you prove earns ${symbol}${REWARD_PER_WORKOUT} of your own money back.`}
              delayMs={360}
            />
          </ol>

          <ScreenActions>
            <Button size="xl" className="w-full" onClick={() => navigate("/challenge")}>
              Build my challenge
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
  subtitle: string;
  options: { id: string; label: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="pt-8">
        <ScreenTitle className="animate-rise-in">{title}</ScreenTitle>
        <ScreenSubtitle className="animate-rise-in [animation-delay:60ms]">{subtitle}</ScreenSubtitle>
      </div>

      <div className="mt-8 space-y-3">
        {options.map((option, position) => (
          <ChoiceButton
            key={option.id}
            label={option.label}
            isSelected={selected === option.id}
            onSelect={() => onSelect(option.id)}
            delayMs={100 + position * 60}
          />
        ))}
      </div>
    </div>
  );
}

function HowStep({
  icon: Icon,
  index,
  title,
  detail,
  delayMs,
}: {
  icon: typeof Target;
  index: number;
  title: string;
  detail: string;
  delayMs: number;
}) {
  return (
    <li className="flex items-start gap-4 rounded-lg bg-card p-4 animate-rise-in" style={{ animationDelay: `${delayMs}ms` }}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary">
        <Icon className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="font-semibold leading-tight text-foreground">
          <span className="tabular text-muted-foreground">{index}. </span>
          {title}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}
