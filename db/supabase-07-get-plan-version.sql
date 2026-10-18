-- ============================================================================
-- 07 - get_active_plan_version function (RUN SEVENTH in Supabase SQL Editor)
-- ============================================================================

create or replace function public.get_active_plan_version(p_plan_key text)
returns table (
  plan_key             text,
  name                 text,
  display_name_ar      text,
  profile_limit        int,
  messages_per_2h      int,
  uploads_daily        int,
  max_file_size_mb     int,
  file_types           text[],
  video_audio_exclusive boolean,
  priority_queue       text,
  trial_days           int,
  is_active            boolean,
  version              int,
  effective_date       timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
begin
  return query
  select
    sp.plan_key, sp.name, sp.display_name_ar, sp.profile_limit, sp.messages_per_2h, sp.uploads_daily,
    sp.max_file_size_mb, sp.file_types, sp.video_audio_exclusive, sp.priority_queue,
    sp.trial_days, sp.is_active, sp.version, sp.effective_date
  from public.subscription_plans sp
  where sp.plan_key = p_plan_key
    and sp.is_active = true
    and sp.effective_date <= now() at time zone 'utc'
  order by sp.version desc
  limit 1;
end;
$func$;

revoke all on function public.get_active_plan_version(text) from public;
revoke all on function public.get_active_plan_version(text) from authenticated;
revoke all on function public.get_active_plan_version(text) from anon;
grant execute on function public.get_active_plan_version(text) to service_role;
