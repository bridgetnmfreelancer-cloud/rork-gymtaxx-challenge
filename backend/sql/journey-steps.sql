-- Journey steps: five new report stages, matching the rebuilt "whole journey"
-- card on the Stats page.
--
-- get_app_at          hero "Download the app" tap (install-first journey)
-- android_tally_at    any Android landing CTA (opens the external Tally form)
-- continue_browser_at "Continue in browser" tapped on the install page
-- onboarding_at       first onboarding question screen appeared
-- saw_paywall_at      the plan-comparison screen rendered (not the free intro)
--
-- Existing steps are untouched. Older "join_tapped" rows still lump the hero
-- and Android taps in under the pre-split counting; the card notes when the
-- new counting started.
--
-- Safe to re-run: the columns are IF NOT EXISTS and the function replacement
-- is idempotent.

alter table public.visits
  add column if not exists get_app_at timestamptz,
  add column if not exists android_tally_at timestamptz,
  add column if not exists continue_browser_at timestamptz,
  add column if not exists onboarding_at timestamptz,
  add column if not exists saw_paywall_at timestamptz;

create or replace function public.record_visit(p_visitor uuid, p_step text, p_source text default null, p_campaign text default null, p_referrer text default null, p_standalone boolean default false, p_in_app boolean default false)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if p_visitor is null then
    return;
  end if;

  -- An unrecognised stage is ignored rather than stored, so this can never
  -- become a free-text write for anyone who finds the endpoint.
  if p_step not in ('landing', 'join_tapped', 'get_app', 'android_tally', 'install', 'continue_browser', 'onboarding', 'signup_form', 'signed_up', 'saw_paywall') then
    return;
  end if;

  insert into public.visits (visitor_id)
  values (p_visitor)
  on conflict (visitor_id) do nothing;

  update public.visits set
    last_seen_at = now(),
    is_standalone = visits.is_standalone or coalesce(p_standalone, false),
    is_in_app_browser = visits.is_in_app_browser or coalesce(p_in_app, false),

    -- First touch wins: the ad that introduced them keeps the credit even if
    -- they come back later through a bare link.
    source = coalesce(visits.source, left(p_source, 120)),
    campaign = coalesce(visits.campaign, left(p_campaign, 120)),
    referrer_host = coalesce(visits.referrer_host, left(p_referrer, 120)),

    landed_at = case when p_step = 'landing' then coalesce(visits.landed_at, now()) else visits.landed_at end,
    tapped_join_at = case when p_step = 'join_tapped' then coalesce(visits.tapped_join_at, now()) else visits.tapped_join_at end,
    get_app_at = case when p_step = 'get_app' then coalesce(visits.get_app_at, now()) else visits.get_app_at end,
    android_tally_at = case when p_step = 'android_tally' then coalesce(visits.android_tally_at, now()) else visits.android_tally_at end,
    reached_install_at = case when p_step = 'install' then coalesce(visits.reached_install_at, now()) else visits.reached_install_at end,
    continue_browser_at = case when p_step = 'continue_browser' then coalesce(visits.continue_browser_at, now()) else visits.continue_browser_at end,
    onboarding_at = case when p_step = 'onboarding' then coalesce(visits.onboarding_at, now()) else visits.onboarding_at end,
    reached_signup_at = case when p_step = 'signup_form' then coalesce(visits.reached_signup_at, now()) else visits.reached_signup_at end,
    signed_up_at = case when p_step = 'signed_up' then coalesce(visits.signed_up_at, now()) else visits.signed_up_at end,
    saw_paywall_at = case when p_step = 'saw_paywall' then coalesce(visits.saw_paywall_at, now()) else visits.saw_paywall_at end,

    user_id = coalesce(visits.user_id, case when p_step = 'signed_up' then auth.uid() else null end)
  where visits.visitor_id = p_visitor;
end;
$function$;
