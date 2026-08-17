import { Banknote, Camera, Target, Trophy } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ChoiceButton } from "@/components/ChoiceButton";
import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import {
  CHALLENGE_WEEKS,
  currencyForRegion,
  currencySymbol,
  REWARD_PER_WORKOUT,
  WEEKLY_GOALS,
  type WeeklyGoal,
} from "@/lib/money";
import {
  BLOCKER_OPTIONS,
  HABIT_OPTIONS,
  loadAnswers,
  saveAnswers,
  type BlockerId,
  type HabitId,
  type OnboardingAnswers,
} from "@/lib/onboarding";
import { recordQuestionsAnswered } from "@/lib/telemetry";

type Stage = "habit" | "goal" | "blocker" | "agitate" | "how";

const ORDER: Stage[] = ["habit", "goal", "blocker", "agitate", "how"];

/**
 * Steps 5 to 7 of the funnel: three questions, the choice in front of them, and
 * how GymTaxx works.
 *
 * Held in one component because moving between them should feel like one
 * continuous flow rather than five page loads.
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

  return (
    <Screen>
      <StepProgress step={index + 1} total={ORDER.length} onBack={index === 0 ? null : goBack} />

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
          title="How often would you like to go?"
          subtitle="This becomes your weekly goal. You can change it before you commit."
          options={WEEKLY_GOALS.map((goal) => ({ id: String(goal), label: `${goal} times per week` }))}
          selected={answers.goal === null ? null : String(answers.goal)}
          onSelect={(id) => chooseAndAdvance({ goal: Number(id) as WeeklyGoal })}
        />
      ) : null}

      {stage === "blocker" ? (
        <Question
          key="blocker"
          title="What is stopping you from achieving your goals?"
          subtitle="Whatever it is, it's beaten you before now."
          options={BLOCKER_OPTIONS.map((option) => ({ id: option.id, label: option.label, detail: option.detail }))}
          selected={answers.blocker}
          onSelect={(id) => {
            // The last of the three questions, so this is the point the funnel
            // can tell "gave up at the questions" from "gave up at the price".
            void recordQuestionsAnswered();
            chooseAndAdvance({ blocker: id as BlockerId });
          }}
        />
      ) : null}

      {stage === "agitate" ? (
        <div className="flex flex-1 flex-col">
          <div className="pt-10">
            <p className="text-display leading-[1.1] text-foreground animate-rise-in">
              Four weeks from now, things could look very different.
            </p>
            {/* One sentence, two futures. The colour split does the work of
                pointing at which half is worth having. */}
            <p className="mt-8 text-2xl font-semibold leading-snug animate-rise-in [animation-delay:600ms]">
              <span className="text-muted-foreground">You could still be waiting for motivation or </span>
              <span className="text-foreground">already four weeks closer to your goals.</span>
            </p>
          </div>

          <ScreenActions className="animate-rise-in [animation-delay:1100ms]">
            <Button size="xl" className="w-full" onClick={goNext}>
              Let's do this
            </Button>
          </ScreenActions>
        </div>
      ) : null}

      {stage === "how" ? (
        <div className="flex flex-1 flex-col">
          <div className="pt-8">
            <ScreenTitle className="animate-rise-in">A quick reminder on how GymTaxx works</ScreenTitle>
          </div>

          <ol className="mt-8 space-y-3">
            <HowStep
              icon={Target}
              index={1}
              title="Choose your weekly goal"
              detail={`3, 4 or 5 workouts a week for ${CHALLENGE_WEEKS} weeks.`}
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
              title="Complete your goal, earn your deposit back"
              detail={`Every workout you prove earns ${symbol}${REWARD_PER_WORKOUT} of your money back.`}
              delayMs={360}
            />
          </ol>

          <ScreenActions>
            <Button size="xl" className="w-full" onClick={() => navigate("/challenge")}>
              Ready for my challenge
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
