-- ===========================================================================
-- MAGICLY — Community C11: اسم المستخدم الخاص بالمجتمع (Handle)
-- ---------------------------------------------------------------------------
-- 1) عمود handle على social_profiles — فريد، بصيغة ^[a-z0-9_]{3,20}$
-- 2) Backfill لكل الحسابات الموجودة (من الاسم، ولو مش صالح من كود MAG)
-- 3) Trigger: أي صف اجتماعي جديد ياخد handle تلقائي
-- 4) change_handle() — الطالب يغيّر اسمه في المجتمع (مع كلمات محجوزة)
-- 5) البحث العام بيطابق handle ويرجّعه + get_social_profile_by_code يعرضه
-- Idempotent: safe to run more than once.
-- ===========================================================================

-- ------------------------------------------------------------- 1) العمود ---
alter table public.social_profiles add column if not exists handle text;

alter table public.social_profiles drop constraint if exists social_profiles_handle_key;
alter table public.social_profiles
  add constraint social_profiles_handle_key unique (handle);

alter table public.social_profiles drop constraint if exists social_profiles_handle_format;
alter table public.social_profiles
  add constraint social_profiles_handle_format
  check (handle is null or handle ~ '^[a-z0-9_]{3,20}$');

-- ----------------------------------------------------------- 2) Backfill ---
do $$
declare
  r record;
  v_base text;
  v_candidate text;
  v_n int;
begin
  for r in
    select sp.user_id, sp.display_name, p.public_user_code,
           row_number() over () as rn
    from public.social_profiles sp
    join public.profiles p on p.id = sp.user_id
    where sp.handle is null
    order by sp.created_at nulls last, sp.user_id
  loop
    v_base := null;
    if r.display_name is not null then
      v_base := regexp_replace(lower(r.display_name), '[^a-z0-9_]+', '_', 'g');
      v_base := btrim(v_base, '_');
      v_base := left(regexp_replace(v_base, '_+', '_', 'g'), 20);
    end if;
    if v_base is null or length(v_base) < 3 then
      v_base := left(lower(replace(regexp_replace(
        coalesce(r.public_user_code, 'MAG-STU-DENT'), '^MAG-', ''), '-', '_')), 20);
    end if;
    if v_base !~ '^[a-z0-9_]{3,20}$' then
      v_base := 'student_' || lpad(r.rn::text, 3, '0');
    end if;
    v_candidate := v_base;
    v_n := 0;
    while exists (select 1 from public.social_profiles s2 where s2.handle = v_candidate) loop
      v_n := v_n + 1;
      v_candidate := left(v_base, 18 - length(v_n::text)) || '_' || v_n::text;
    end loop;
    update public.social_profiles set handle = v_candidate where user_id = r.user_id;
  end loop;
end $$;

-- ------------------------------------------- 3) Trigger للحسابات الجديدة ---
create or replace function public.social_profiles_default_handle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_code text;
  v_candidate text;
  v_n int;
begin
  if new.handle is not null and btrim(new.handle) <> '' then
    new.handle := lower(btrim(new.handle));
    return new;
  end if;
  select public_user_code into v_code from public.profiles where id = new.user_id;
  if new.display_name is not null then
    v_base := regexp_replace(lower(new.display_name), '[^a-z0-9_]+', '_', 'g');
    v_base := left(regexp_replace(btrim(v_base, '_'), '_+', '_', 'g'), 20);
  end if;
  if v_base is null or length(v_base) < 3 then
    v_base := left(lower(replace(regexp_replace(coalesce(v_code, 'MAG-STU-DENT'), '^MAG-', ''), '-', '_')), 20);
  end if;
  if v_base !~ '^[a-z0-9_]{3,20}$' then
    v_base := 'student_' || left(replace(coalesce(v_code, 'STU'), '-', ''), 8);
  end if;
  v_candidate := v_base;
  v_n := 0;
  while exists (select 1 from public.social_profiles s2 where s2.handle = v_candidate and s2.user_id <> new.user_id) loop
    v_n := v_n + 1;
    v_candidate := left(v_base, 18 - length(v_n::text)) || '_' || v_n::text;
  end loop;
  new.handle := v_candidate;
  return new;
end;
$$;

drop trigger if exists trg_social_profiles_default_handle on public.social_profiles;
create trigger trg_social_profiles_default_handle
  before insert on public.social_profiles
  for each row execute function public.social_profiles_default_handle();

-- --------------------------------------------------- 4) تغيير الـ handle ---
create or replace function public.change_handle(p_handle text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_handle text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  v_handle := lower(btrim(coalesce(p_handle, '')));
  if v_handle !~ '^[a-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_handle');
  end if;
  if v_handle in ('support','admin','magic','magicly','moderation','root',
                  'system','staff','team','official','null','undefined') then
    return jsonb_build_object('ok', false, 'code', 'reserved_handle');
  end if;
  if exists (
    select 1 from public.social_profiles
    where handle = v_handle and user_id <> v_me
  ) then
    return jsonb_build_object('ok', false, 'code', 'handle_taken');
  end if;
  update public.social_profiles
  set handle = v_handle, updated_at = now()
  where user_id = v_me;
  if not found then
    insert into public.social_profiles (user_id, handle)
    values (v_me, v_handle)
    on conflict (user_id) do update set handle = excluded.handle, updated_at = now();
  end if;
  return jsonb_build_object('ok', true, 'handle', v_handle);
end;
$$;

revoke all on function public.change_handle(text) from public, anon;
grant execute on function public.change_handle(text) to authenticated;

-- ------------------------------------- 5) البحث العام يفهم الـ handle ---
drop function if exists public.public_search_public_profiles(text, text, text, text, text[], int);
create or replace function public.public_search_public_profiles(
  p_query text default null,
  p_university text default null,
  p_faculty text default null,
  p_specialization text default null,
  p_interests text[] default null,
  p_limit int default 20
)
returns table (
  profile_id uuid, display_name text, avatar_url text, university text,
  faculty text, specialization text, year text, interests text[], bio text,
  handle text,
  is_visible boolean, match_score numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_q text := nullif(trim(coalesce(p_query, '')), '');
  v_h text; -- البحث بالـ handle — بنشيل @ لو المستخدم كتبها
begin
  if v_me is null then
    return;
  end if;
  v_h := nullif(ltrim(v_q, '@'), '');

  return query
  with base as (
    select
      p.id                       as profile_id,
      coalesce(sp.display_name, p.display_name) as display_name,
      sp.avatar_url              as avatar_url,
      sp.university              as university,
      sp.faculty                 as faculty,
      sp.major                   as specialization,
      sp.year                    as year,
      sp.interests               as interests,
      sp.bio                     as bio,
      sp.account_privacy         as privacy,
      sp.show_academic_info      as show_academic,
      p.public_user_code         as code,
      sp.handle                  as handle,
      (sp.university is not null and sp.show_academic_info) as has_academic
    from public.profiles p
    left join public.social_profiles sp on sp.user_id = p.id
    where p.id <> v_me
      -- الحظر بأي اتجاه → مختفي تمامًا من البحث
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = v_me and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = v_me)
      )
      and (
        v_q is null
        or p.public_user_code ilike v_q
        or coalesce(sp.display_name, p.display_name) ilike '%' || v_q || '%'
        or (v_h is not null and sp.handle ilike '%' || v_h || '%')
      )
      and (p_university is null or sp.university = p_university)
      and (p_faculty is null or sp.faculty = p_faculty)
      and (p_specialization is null or sp.major = p_specialization)
      and (p_interests is null or sp.interests && p_interests)
  )
  select
    base.profile_id,
    base.display_name,
    base.avatar_url,
    -- الحسابات الخاصة أو اللي خبّيت معلوماتها الأكاديمية: الهوية المختصرة فقط
    case when base.privacy = 'private' or not base.show_academic then null else base.university end,
    case when base.privacy = 'private' or not base.show_academic then null else base.faculty end,
    case when base.privacy = 'private' or not base.show_academic then null else base.specialization end,
    case when base.privacy = 'private' or not base.show_academic then null else base.year end,
    case when base.privacy = 'private' or not base.show_academic then null else base.interests end,
    case when base.privacy = 'private' then null else base.bio end,
    base.handle,
    (base.privacy = 'public') as is_visible,
    -- الترتيب: handle مطابق تمامًا أولًا، ثم MAG ID كامل، ثم بادئة الاسم، ثم احتواء
    case
      when base.handle is not null and v_h is not null and base.handle = v_h then 1.0
      when base.code is not null and v_q is not null and lower(base.code) = lower(v_q) then 0.95
      when base.display_name ilike v_q || '%' then 0.9
      else 0.7
    end::numeric as match_score
  from base
  order by match_score desc, base.display_name asc nulls last
  limit least(coalesce(p_limit, 20), 100);
end;
$$;

revoke all on function public.public_search_public_profiles(text, text, text, text, text[], int) from public, anon;
grant execute on function public.public_search_public_profiles(text, text, text, text, text[], int) to authenticated;

-- ------------------------------- 6) صفحة البروفايل تعرض الـ handle ---
create or replace function public.get_social_profile_by_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row record;
  v_is_friend boolean;
  v_show_academic boolean;
begin
  if v_me is null then
    return jsonb_build_object('found', false);
  end if;

  select
    p.id as user_id, p.public_user_code,
    coalesce(sp.display_name, p.display_name) as display_name,
    coalesce(sp.avatar_url, p.avatar_url) as avatar_url,
    sp.cover_url, sp.bio, sp.handle,
    sp.university, sp.faculty, sp.major, sp.year, sp.interests,
    sp.account_privacy, sp.show_academic_info,
    sp.allow_messages, sp.allow_friend_requests
  into v_row
  from public.profiles p
  left join public.social_profiles sp on sp.user_id = p.id
  where lower(p.public_user_code) = lower(p_code);

  if v_row.user_id is null then
    return jsonb_build_object('found', false);
  end if;

  if public.social_users_blocked(v_me, v_row.user_id) then
    return jsonb_build_object('found', false);
  end if;

  v_is_friend := public.social_are_friends(v_me, v_row.user_id);
  v_show_academic := coalesce(v_row.show_academic_info, true)
    and (v_row.account_privacy is distinct from 'private' or v_is_friend);

  return jsonb_build_object(
    'found', true,
    'user_id', v_row.user_id,
    'public_user_code', v_row.public_user_code,
    'display_name', v_row.display_name,
    'avatar_url', v_row.avatar_url,
    'cover_url', v_row.cover_url,
    'bio', case when v_row.account_privacy = 'private' and not v_is_friend then null else v_row.bio end,
    'handle', v_row.handle,
    'university', case when v_show_academic then v_row.university end,
    'faculty', case when v_show_academic then v_row.faculty end,
    'major', case when v_show_academic then v_row.major end,
    'year', case when v_show_academic then v_row.year end,
    'interests', case when v_show_academic then v_row.interests end,
    'account_privacy', coalesce(v_row.account_privacy, 'public'),
    'allow_messages', coalesce(v_row.allow_messages, true),
    'allow_friend_requests', coalesce(v_row.allow_friend_requests, true),
    'is_self', v_row.user_id = v_me,
    'relation', public.get_relation_state(v_row.user_id)
  );
end;
$$;

revoke all on function public.get_social_profile_by_code(text) from public;
grant execute on function public.get_social_profile_by_code(text) to authenticated;
