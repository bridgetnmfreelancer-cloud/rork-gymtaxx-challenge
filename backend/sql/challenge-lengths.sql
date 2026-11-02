-- 1, 2 and 4-week challenges.
--
-- The standard catalogue currently holds a single 4-week row. This adds 1-week
-- and 2-week standard rows mirroring it (same name and reward), so enrolment
-- can join the row for whichever length was chosen and the deposit and access
-- fee are both priced from that row's own terms.
--
-- Idempotent: each length is inserted only if no standard row with that week
-- count exists, so re-running never duplicates. The newest existing 4-week
-- standard row is the template; the 4-week option itself is left untouched.
--
-- No schema changes, no back-fill of participation rows, and no touch to the
-- trial_week row — existing challenges ride to completion on the terms they
-- were sold on.

insert into challenges (name, reward_per_workout, number_of_weeks, start_date, challenge_type)
select
  c.name,
  c.reward_per_workout,
  w.weeks,
  c.start_date,
  'standard'
from challenges c
cross join (
  select unnest(array[1, 2]) as weeks
) w
where c.challenge_type = 'standard'
  and c.number_of_weeks = 4
  and c.start_date = (
    select max(start_date)
    from challenges
    where challenge_type = 'standard' and number_of_weeks = 4
  )
  and not exists (
    select 1
    from challenges t
    where t.challenge_type = 'standard'
      and t.number_of_weeks = w.weeks
  );

-- Verify: exactly one standard row per length (1, 2, 4), all sharing the
-- template's name and reward.
select number_of_weeks, name, reward_per_workout, start_date
from challenges
where challenge_type = 'standard'
order by number_of_weeks;
