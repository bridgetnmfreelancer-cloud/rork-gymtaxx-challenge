import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import { enrolQuietly } from "@/lib/enrol";
import { supabase } from "@/lib/supabase";
import { recordVisit } from "@/lib/visitor";

/**
 * Where Apple and Google return people after they authorise.
 *
 * A social login says nothing about whether the account is new, so this screen
 * has to work it out before deciding where to send them. It asks the profile: a
 * person who has never answered the questions still needs to, whether they made
 * their account thirty seconds ago or abandoned it last week. That makes the
 * rule useful beyond first sign-in — it resumes anyone who dropped out early.
 *
 * The session itself is established by the Supabase client, which reads the code
 * out of the URL on load. This screen only waits for that to finish.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function land(): Promise<void> {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;

        if (error || !data.session) {
          // Most often an abandoned consent screen, or a return trip that landed
          // in a different browser from the one that started it.
          console.error("auth callback: no session after redirect", error?.message);
          setFailed(true);
          return;
        }

        const userId = data.session.user.id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("answered_questions_at, onboarding_completed")
          .eq("id", userId)
          .maybeSingle();
        if (cancelled) return;

        const isNew = !profile || (profile.answered_questions_at === null && !profile.onboarding_completed);

        if (isNew) {
          // Joins this arrival up with the anonymous part of the funnel, exactly
          // as the email sign-up path does.
          void recordVisit("signed_up");
          // Everything they chose anonymously becomes theirs here, then straight
          // on to the plans — they have already built the challenge and read the
          // deposit, so there is nothing left to explain.
          await enrolQuietly(userId);
          navigate("/plan", { replace: true });
          return;
        }

        navigate("/home", { replace: true });
      } catch (caught) {
        if (cancelled) return;
        console.error("auth callback: could not complete sign-in", caught);
        setFailed(true);
      }
    }

    void land();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (failed) {
    return (
      <Screen>
        <div className="pt-16">
          <ScreenTitle>We couldn't finish signing you in.</ScreenTitle>
          <ScreenSubtitle>
            Nothing has changed on your account. Try again, or use your email and password.
          </ScreenSubtitle>
        </div>
        <ScreenActions>
          <Button size="xl" className="w-full" onClick={() => navigate("/welcome", { replace: true })}>
            Back to sign in
          </Button>
        </ScreenActions>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </Screen>
  );
}
