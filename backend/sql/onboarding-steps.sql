-- Onboarding, screen by screen (26 Oct 2026)
--
-- The onboarding previously reported only two moments: `onboarding_at`
-- (entered) and `reached_signup_at` (finished). With five questions and two
-- statement screens in between, the drop-off was invisible. These columns
-- record the first time each visitor sees each screen, one per stage:
--
--   ob_opening_at    the opening statement screen
--   ob_mechanism_at  the how-it-works screen
--   ob_habit_at      Q1 - how often they currently go
--   ob_goal_at       Q2 - weekly goal
--   ob_blocker_at    Q3 - what's been stopping them
--   ob_motivation_at Q4 - why it matters
--   ob_struggling_at Q5 - how long they've struggled
--   ob_summary_at    the summary screen
--
-- First view wins (coalesce in record_visit), so back-taps, resumes and
-- locked phones never double-count. Counts begin from deploy - no back-fill.

alter table public.visits
  add column if not exists ob_opening_at timestamptz,
  add column if not exists ob_mechanism_at timestamptz,
  add column if not exists ob_habit_at timestamptz,
  add column if not exists ob_goal_at timestamptz,
  add column if not exists ob_blocker_at timestamptz,
  add column if not exists ob_motivation_at timestamptz,
  add column if not exists ob_struggling_at timestamptz,
  add column if not exists ob_summary_at timestamptz;
