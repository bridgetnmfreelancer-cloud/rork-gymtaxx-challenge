import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ChoiceButton } from "@/components/ChoiceButton";
import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthProvider";
import { enrolQuietly } from "@/lib/enrol";
import { COMMITMENT_OPTIONS, loadAnswers, saveAnswers, type CommitmentId } from "@/lib/onboarding";

type Stage = "commitment" | "proof";

/**
 * The last two screens before the account gate.
 *
 * The commitment question is asked *after* they've seen the deposit rather than
 * before: saying "very committed" the moment after reading what it costs is a
 * far stronger thing to have said than agreeing in the abstract, and it's the
 * last thing in their head when the price appears.
 *
 * The result that follows is real — two cohorts, 90% and 100% — and is worded as
 * cohorts rather than a bare percentage so it stays defensible.
 */
export default function Ready() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [stage, setStage] = useState<Stage>("commitment");
  const [selected, setSelected] = useState<CommitmentId | null>(() => loadAnswers().commitment);
  const [isWorking, setIsWorking] = useState<boolean>(false);

  const choose = useCallback((id: CommitmentId): void => {
    setSelected(id);
    saveAnswers({ ...loadAnswers(), commitment: id });
    window.setTimeout(() => setStage("proof"), 220);
  }, []);

  /**
   * Someone signed in already configured this before; they skip the account
   * screen entirely and go straight to the plans with their challenge created.
   */
  const start = useCallback(async (): Promise<void> => {
    const userId = session?.user.id;
    if (!userId) {
      navigate("/welcome");
      return;
    }

    setIsWorking(true);
    await enrolQuietly(userId);
    setIsWorking(false);
    navigate("/plan");
  }, [session, navigate]);

  return (
    <Screen>
      <StepProgress
        step={3}
        total={5}
        onBack={stage === "commitment" ? () => navigate(-1) : () => setStage("commitment")}
      />

      {stage === "commitment" ? (
        <div className="flex flex-1 flex-col">
          <div className="pt-8">
            <ScreenTitle className="animate-rise-in">
              How committed are you to becoming consistent with the gym?
            </ScreenTitle>
          </div>

          <div className="mt-8 space-y-3">
            {COMMITMENT_OPTIONS.map((option, position) => (
              <ChoiceButton
                key={option.id}
                label={option.label}
                isSelected={selected === option.id}
                onSelect={() => choose(option.id)}
                delayMs={100 + position * 60}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="pt-10">
            <ScreenTitle className="animate-rise-in">You're in the right place.</ScreenTitle>
            <ScreenSubtitle className="animate-rise-in [animation-delay:400ms]">
              Across our first two cohorts, over 90% of GymTaxx members hit their gym goal in their first month.
            </ScreenSubtitle>
            <p className="mt-6 text-2xl font-semibold leading-snug text-foreground animate-rise-in [animation-delay:900ms]">
              Most of them had never been consistent in their lives.
            </p>
          </div>

          <ScreenActions className="animate-rise-in [animation-delay:1300ms]">
            <Button size="xl" className="w-full" onClick={() => void start()} disabled={isWorking}>
              {isWorking ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
              Get started
            </Button>
          </ScreenActions>
        </div>
      )}
    </Screen>
  );
}
