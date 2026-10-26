-- Opening question answers (26 Oct 2026)
--
-- The opening screen changed from a tap-to-continue statement to a question
-- with two answers: "Yes, I'm consistent." / "No, I keep falling off." Each
-- answer gets its own first-touch stamp, so the stats page can show the split.
--
-- The pair is deliberately two columns, not one: a visitor can only ever
-- answer once, and a single column would need an extra write to disambiguate.

alter table public.visits
  add column if not exists ob_opening_yes_at timestamptz,
  add column if not exists ob_opening_no_at timestamptz;
