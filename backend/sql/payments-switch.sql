-- The site's pause switch.
--
-- `payments_enabled` = 'off' closes the site to visitors and refuses every new
-- charge. The frontend shows a "paused" screen instead of the sign-up flow
-- (existing operator screens /review and /stats stay reachable), and the
-- payment server returns "closed" for any checkout it is asked to open —
-- belt and braces, so the money can never move on the client's word alone.
--
-- To REOPEN the site, run:
--   update app_config set value = 'on' where key = 'payments_enabled';
--
-- Nothing else changes: challenge rows, accounts, subscriptions and history
-- are untouched, and reopening requires no deploy.
--
-- Subscriptions that were active when the site closed already have "cancel at
-- period end" set, so Stripe stops billing them on its own; closing the site
-- does not cancel anyone's plan retroactively.

update app_config set value = 'off' where key = 'payments_enabled';

insert into app_config (key, value)
select 'payments_enabled', 'off'
where not exists (select 1 from app_config where key = 'payments_enabled');