-- ===========================================================================
-- MAGICLY — Community C1: Discovery & Relations (أصدقاء + متابعة + حظر)
-- ===========================================================================
-- الأساس الاجتماعي لمجتمع Magicly (المرحلة C1):
--   1. social_profiles   — الهوية الاجتماعية (bio، جامعة/كلية/تخصص، اهتمامات،
--                          خصوصية الحساب، تحكم في الطلبات والمراسلة)
--   2. friend_requests   — طلبات الصداقة (pending/accepted/rejected/cancelled)
--   3. friendships       — الصداقة المتبادلة (صفّان متناظران لسهولة RLS)
--   4. follows           — المتابعة باتجاه واحد (نمط X) للحسابات العامة
--   5. RPCs              — البحث الآمن + إجراءات العلاقات (security definer
--                          بفرض الحظر والخصوصية على مستوى قاعدة البيانات)
--
-- قواعد الحماية المعمارية (من قرار التصميم):
--   - الحظر (user_blocks من db/94) يمنع: طلب صداقة، متابعة، والظهور في البحث
--     والاقتراحات — مفروض في الـRPCs وليس في الواجهة فقط.
--   - لا يوجد أي وصول لبيانات الحساب الخاصة في نتائج البحث: الحسابات الخاصة
--     تظهر بهوية مختصرة (اسم + MAG ID + صورة) بدون المعلومات الأكاديمية.
--   - لا صداقة مع النفس، ولا تكرار، ولا تجاوز الحالة الحالية للعلاقة.
--   - سقف على طلبات الصداقة المعلّقة (30) كخط أول ضد الإزعاج الآلي.
--
-- Idempotent: safe to run more than once.
-- ===========================================================================

-- ----------------------------------------------------------------------------
-- 0) user_blocks — bootstrap مستقل (الجدول معرّف أصلًا في db/94-user-blocks.sql
--    لكنه لم يُطبَّق على كل قواعد البيانات؛ نضمنه هنا عشان الملف يشتغل وحده)
-- ----------------------------------------------------------------------------

create table if not exists public.user_blocks (
  id              uuid primary key default gen_random_uuid(),
  blocker_id      uuid not null
    references auth.users (id) on delete cascade,
  blocked_id      uuid not null
    references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),

  unique (blocker_id, blocked_id)
);

create index if not exists idx_user_blocks_blocker
  on public.user_blocks (blocker_id);

create index if not exists idx_user_blocks_blocked
  on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "user_blocks: insert own block" on public.user_blocks;
create policy "user_blocks: insert own block"
  on public.user_blocks for insert
  with check (blocker_id = auth.uid());

drop policy if exists "user_blocks: read own blocks" on public.user_blocks;
create policy "user_blocks: read own blocks"
  on public.user_blocks for select
  using (blocker_id = auth.uid());

drop policy if exists "user_blocks: delete own block" on public.user_blocks;
create policy "user_blocks: delete own block"
  on public.user_blocks for delete
  using (blocker_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 1) social_profiles — الهوية الاجتماعية لكل طالب (1:1 مع auth.users)
-- ----------------------------------------------------------------------------

create table if not exists public.social_profiles (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  -- اختياري: اسم العرض في المجتمع؛ null → profiles.display_name
  display_name         text check (display_name is null or char_length(trim(display_name)) between 2 and 60),
  bio                  text check (bio is null or char_length(bio) <= 500),
  avatar_url           text,
  cover_url            text,
  university           text,
  faculty              text,
  major                text,
  year                 text,
  interests            text[] not null default '{}',
  -- عام: قابل للاكتشاف ومحتواه المسموح ظاهر. خاص: يُكتشف بالاسم/الكود فقط
  -- وتفاصيله الأكاديمية تُخفى عن غير الأصدقاء.
  account_privacy      text not null default 'public' check (account_privacy in ('public','private')),
  allow_friend_requests boolean not null default true,
  allow_messages       boolean not null default true,
  show_academic_info   boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.social_profiles is
  'Magicly Community C1 — social identity per student. Privacy fields (account_privacy/allow_*/show_*) are enforced server-side in RPCs, not in the UI only.';

create index if not exists idx_social_profiles_university on public.social_profiles (university) where university is not null;
create index if not exists idx_social_profiles_faculty    on public.social_profiles (faculty)    where faculty is not null;
create index if not exists idx_social_profiles_major      on public.social_profiles (major)      where major is not null;

alter table public.social_profiles enable row level security;

-- المالك يتحكم في ملفه بالكامل (قراءة/تعديل) — وصفحة البروفايل العامة تقرأ
-- عبر الـRPC اللي بيطبق الخصوصية، مش من الجدول مباشرة.
create policy "social_profiles: owner all"
  on public.social_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2) friend_requests — طلبات الصداقة
-- ----------------------------------------------------------------------------

create table if not exists public.friend_requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users (id) on delete cascade,
  addressee_id  uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending','accepted','rejected','cancelled')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,

  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists idx_friend_requests_addressee
  on public.friend_requests (addressee_id) where status = 'pending';
create index if not exists idx_friend_requests_requester
  on public.friend_requests (requester_id) where status = 'pending';

alter table public.friend_requests enable row level security;

-- الطرفان يقرآن طلباتهما فقط (الواجهة تجلب عبر /api/community/friends
-- التي تستخدم RPCs أيضاً؛ هذه السياسة دفاع ثانٍ).
create policy "friend_requests: participants read"
  on public.friend_requests for select
  using (auth.uid() in (requester_id, addressee_id));

-- إنشاء الطلب يتم عبر RPC send_friend_request فقط (يفرض الحظر والخصوصية
-- والسقف) — لا insert مباشر من العملاء.
create policy "friend_requests: no direct insert"
  on public.friend_requests for insert
  with check (false);

-- قبول/رفض: المُرسل إليه فقط، عبر RPC respond_friend_request.
create policy "friend_requests: addressee update"
  on public.friend_requests for update
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id);

-- إلغاء: الطالب صاحب الطلب فقط، عبر RPC cancel_friend_request.
create policy "friend_requests: requester delete"
  on public.friend_requests for delete
  using (auth.uid() = requester_id);

-- ----------------------------------------------------------------------------
-- 3) friendships — الصداقة المتبادلة (صفّان متناظران)
-- ----------------------------------------------------------------------------

create table if not exists public.friendships (
  user_id    uuid not null references auth.users (id) on delete cascade,
  friend_id  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create index if not exists idx_friendships_friend on public.friendships (friend_id);

alter table public.friendships enable row level security;

create policy "friendships: read own edges"
  on public.friendships for select
  using (auth.uid() in (user_id, friend_id));

-- الكتابة عبر RPC respond_friend_request (security definer) فقط.
create policy "friendships: no direct write"
  on public.friendships for insert
  with check (false);
create policy "friendships: no direct update"
  on public.friendships for update
  using (false);
create policy "friendships: no direct delete"
  on public.friendships for delete
  using (false);

-- ----------------------------------------------------------------------------
-- 4) follows — المتابعة باتجاه واحد (للحسابات العامة)
-- ----------------------------------------------------------------------------

create table if not exists public.follows (
  follower_id  uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),

  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists idx_follows_following on public.follows (following_id);

alter table public.follows enable row level security;

create policy "follows: read own relations"
  on public.follows for select
  using (auth.uid() in (follower_id, following_id));

-- الكتابة عبر RPC follow_user/unfollow_user فقط (يفرض الحظر وخصوصية الحساب).
create policy "follows: no direct insert"
  on public.follows for insert
  with check (false);
create policy "follows: no direct delete"
  on public.follows for delete
  using (false);

-- ----------------------------------------------------------------------------
-- 5) RPCs — العلاقات (security definer بفرض الحظر + الخصوصية + السقوف)
-- ----------------------------------------------------------------------------

-- helper: هل يوجد حظر بين طرفين بأي اتجاه؟
create or replace function public.social_users_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- helper: هل هوما صديقين؟
create or replace function public.social_are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where user_id = a and friend_id = b
  );
$$;

-- إرسال طلب صداقة
create or replace function public.send_friend_request(p_addressee uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_target social_profiles;
  v_pending_count int;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if p_addressee is null or p_addressee = v_me then
    return jsonb_build_object('ok', false, 'code', 'invalid_target');
  end if;
  if public.social_users_blocked(v_me, p_addressee) then
    -- نفس الرسالة عمّا كان الهدف موجودًا أم لا — لا نكشف وجود الحساب
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;

  select * into v_target from public.social_profiles where user_id = p_addressee;
  if v_target.user_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not v_target.allow_friend_requests then
    return jsonb_build_object('ok', false, 'code', 'requests_disabled');
  end if;

  -- صديقين بالفعل؟
  if public.social_are_friends(v_me, p_addressee) then
    return jsonb_build_object('ok', false, 'code', 'already_friends');
  end if;

  -- طلب قائم بين الطرفين بأي اتجاه؟
  if exists (
    select 1 from public.friend_requests
    where status = 'pending'
      and ((requester_id = v_me and addressee_id = p_addressee)
        or (requester_id = p_addressee and addressee_id = v_me))
  ) then
    return jsonb_build_object('ok', false, 'code', 'request_exists');
  end if;

  -- سقف الطلبات الصادرة المعلّقة (مضاد سبام)
  select count(*) into v_pending_count
  from public.friend_requests
  where requester_id = v_me and status = 'pending';
  if v_pending_count >= 30 then
    return jsonb_build_object('ok', false, 'code', 'too_many_pending');
  end if;

  insert into public.friend_requests (requester_id, addressee_id)
  values (v_me, p_addressee)
  on conflict (requester_id, addressee_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

-- الرد على طلب صداقة (قبول/رفض) — المُرسل إليه فقط
create or replace function public.respond_friend_request(p_request_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_req public.friend_requests;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if p_action not in ('accept','reject') then
    return jsonb_build_object('ok', false, 'code', 'invalid_action');
  end if;

  select * into v_req from public.friend_requests where id = p_request_id for update;
  if v_req.id is null or v_req.addressee_id <> v_me then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'already_handled');
  end if;

  -- حظر لاحق بين الطرفين؟ لا يُقبل الطلب.
  if public.social_users_blocked(v_req.requester_id, v_req.addressee_id) then
    update public.friend_requests set status = 'rejected', responded_at = now() where id = p_request_id;
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;

  if p_action = 'accept' then
    update public.friend_requests set status = 'accepted', responded_at = now() where id = p_request_id;
    insert into public.friendships (user_id, friend_id) values (v_me, v_req.requester_id), (v_req.requester_id, v_me)
    on conflict do nothing;
    return jsonb_build_object('ok', true, 'status', 'friends');
  else
    update public.friend_requests set status = 'rejected', responded_at = now() where id = p_request_id;
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;
end;
$$;

-- إلغاء طلب أرسلته أنت
create or replace function public.cancel_friend_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  delete from public.friend_requests
  where id = p_request_id and requester_id = v_me and status = 'pending';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- إزالة صديق (يمسح الحدّين)
create or replace function public.remove_friend(p_friend uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  delete from public.friendships
  where (user_id = v_me and friend_id = p_friend)
     or (user_id = p_friend and friend_id = v_me);
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- متابعة حساب (الحسابات الخاصة: صداقة فقط)
create or replace function public.follow_user(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_target social_profiles;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if p_target is null or p_target = v_me then
    return jsonb_build_object('ok', false, 'code', 'invalid_target');
  end if;
  if public.social_users_blocked(v_me, p_target) then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;

  select * into v_target from public.social_profiles where user_id = p_target;
  if v_target.user_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_target.account_privacy = 'private' then
    return jsonb_build_object('ok', false, 'code', 'private_account');
  end if;

  insert into public.follows (follower_id, following_id) values (v_me, p_target)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- إلغاء متابعة
create or replace function public.unfollow_user(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  delete from public.follows where follower_id = v_me and following_id = p_target;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- حالة العلاقة بيني وبين مستخدم (لصفحة البروفايل)
create or replace function public.get_relation_state(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_state text;
  v_request_id uuid;
begin
  if v_me is null or p_user is null then
    return jsonb_build_object('state', 'anonymous');
  end if;
  if p_user = v_me then
    return jsonb_build_object('state', 'self');
  end if;

  if public.social_users_blocked(v_me, p_user) then
    return jsonb_build_object('state', 'blocked');
  end if;

  if public.social_are_friends(v_me, p_user) then
    return jsonb_build_object('state', 'friends');
  end if;

  select id into v_request_id from public.friend_requests
  where status = 'pending' and requester_id = v_me and addressee_id = p_user;
  if v_request_id is not null then
    return jsonb_build_object('state', 'pending_sent', 'request_id', v_request_id);
  end if;

  select id into v_request_id from public.friend_requests
  where status = 'pending' and requester_id = p_user and addressee_id = v_me;
  if v_request_id is not null then
    return jsonb_build_object('state', 'pending_received', 'request_id', v_request_id);
  end if;

  if exists (select 1 from public.follows where follower_id = v_me and following_id = p_user) then
    v_state := 'following';
  else
    v_state := 'none';
  end if;

  return jsonb_build_object('state', v_state);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) RPC البحث الآمن — نفس توقيع /api/users/search الحالي
-- ----------------------------------------------------------------------------

create or replace function public.public_search_public_profiles(
  p_query text default null,
  p_university text default null,
  p_faculty text default null,
  p_specialization text default null,
  p_interests text[] default null,
  p_limit int default 20
)
returns table (
  profile_id uuid,
  display_name text,
  avatar_url text,
  university text,
  faculty text,
  specialization text,
  year text,
  interests text[],
  bio text,
  is_visible boolean,
  match_score numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_q text := nullif(trim(coalesce(p_query, '')), '');
  v_me_sp social_profiles;
begin
  if v_me is null then
    return;
  end if;
  select * into v_me_sp from public.social_profiles where user_id = v_me;

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
    (base.privacy = 'public') as is_visible,
    -- ترتيب: تطابق MAG ID كامل أولًا، ثم بادئة الاسم، ثم احتواء
    case
      when base.code is not null and v_q is not null and lower(base.code) = lower(v_q) then 1.0
      when base.display_name ilike v_q || '%' then 0.9
      else 0.7
    end::numeric as match_score
  from base
  order by match_score desc, base.display_name asc nulls last
  limit least(coalesce(p_limit, 20), 100);
end;
$$;

revoke all on function public.public_search_public_profiles(text,text,text,text,text[],int) from public;
grant execute on function public.public_search_public_profiles(text,text,text,text,text[],int) to authenticated;

-- منح تنفيذ RPCs العلاقات للمصادقين فقط
revoke all on function public.send_friend_request(uuid) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;
revoke all on function public.respond_friend_request(uuid,text) from public;
grant execute on function public.respond_friend_request(uuid,text) to authenticated;
revoke all on function public.cancel_friend_request(uuid) from public;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
revoke all on function public.remove_friend(uuid) from public;
grant execute on function public.remove_friend(uuid) to authenticated;
revoke all on function public.follow_user(uuid) from public;
grant execute on function public.follow_user(uuid) to authenticated;
revoke all on function public.unfollow_user(uuid) from public;
grant execute on function public.unfollow_user(uuid) to authenticated;
revoke all on function public.get_relation_state(uuid) from public;
grant execute on function public.get_relation_state(uuid) to authenticated;
revoke all on function public.social_users_blocked(uuid,uuid) from public;
revoke all on function public.social_are_friends(uuid,uuid) from public;

-- تنظيف العلاقات عند الحظر: الحظر يقطع الصداقة والمتابعة والطلبات بالاتجاهين.
-- يستدعيه /api/community/block قبل إدراج صف الحظر.
create or replace function public.cleanup_relation_on_block(p_a uuid, p_b uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_a then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  delete from public.friendships
  where (user_id = p_a and friend_id = p_b) or (user_id = p_b and friend_id = p_a);
  delete from public.follows
  where (follower_id = p_a and following_id = p_b) or (follower_id = p_b and following_id = p_a);
  delete from public.friend_requests
  where status = 'pending'
    and ((requester_id = p_a and addressee_id = p_b) or (requester_id = p_b and addressee_id = p_a));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.cleanup_relation_on_block(uuid,uuid) from public;
grant execute on function public.cleanup_relation_on_block(uuid,uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) اقتراح الأصدقاء — نفس الجامعة/الكلية/التخصص (بدون حظر أو علاقة قائمة)
-- ----------------------------------------------------------------------------

create or replace function public.suggest_community_friends(p_limit int default 10)
returns table (
  profile_id uuid,
  display_name text,
  avatar_url text,
  university text,
  faculty text,
  specialization text,
  shared_field text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_me_sp social_profiles;
begin
  if v_me is null then
    return;
  end if;
  select * into v_me_sp from public.social_profiles where user_id = v_me;
  if v_me_sp.user_id is null then
    return;
  end if;

  return query
  select
    sp.user_id           as profile_id,
    coalesce(sp.display_name, p.display_name) as display_name,
    sp.avatar_url        as avatar_url,
    sp.university        as university,
    sp.faculty           as faculty,
    sp.major             as specialization,
    case
      when sp.university = v_me_sp.university and sp.faculty = v_me_sp.faculty and sp.major = v_me_sp.major then 'same_major'
      when sp.university = v_me_sp.university and sp.faculty = v_me_sp.faculty then 'same_faculty'
      else 'same_university'
    end::text            as shared_field
  from public.social_profiles sp
  join public.profiles p on p.id = sp.user_id
  where sp.user_id <> v_me
    and sp.account_privacy = 'public'
    and (
      (v_me_sp.university is not null and sp.university = v_me_sp.university)
    )
    -- مفيش علاقة قائمة (صداقة/طلب/متابعة)
    and not exists (select 1 from public.friendships f where f.user_id = v_me and f.friend_id = sp.user_id)
    and not exists (
      select 1 from public.friend_requests r
      where r.status = 'pending'
        and ((r.requester_id = v_me and r.addressee_id = sp.user_id)
          or (r.requester_id = sp.user_id and r.addressee_id = v_me))
    )
    -- الحظر بأي اتجاه → مستبعد
    and not public.social_users_blocked(v_me, sp.user_id)
  order by
    case
      when sp.major = v_me_sp.major then 0
      when sp.faculty = v_me_sp.faculty then 1
      else 2
    end,
    random()
  limit least(coalesce(p_limit, 10), 30);
end;
$$;

revoke all on function public.suggest_community_friends(int) from public;
grant execute on function public.suggest_community_friends(int) to authenticated;

-- ----------------------------------------------------------------------------
-- 8) قوائم العلاقات — قراءة عبر RPC فقط (social_profiles للآخرين غير مقروءة
--    مباشرة بسبب RLS، فبنرجّع البيانات المسموحة من هنا)
-- ----------------------------------------------------------------------------

create or replace function public.list_community_friends()
returns table (
  friend_id uuid,
  display_name text,
  avatar_url text,
  public_user_code text,
  friends_since timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.friend_id,
    coalesce(sp.display_name, p.display_name) as display_name,
    sp.avatar_url,
    p.public_user_code,
    f.created_at
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  left join public.social_profiles sp on sp.user_id = f.friend_id
  where f.user_id = auth.uid()
  order by f.created_at desc;
$$;

create or replace function public.list_pending_friend_requests()
returns table (
  direction text,          -- 'incoming' | 'outgoing'
  request_id uuid,
  user_id uuid,            -- الطرف الآخر
  display_name text,
  avatar_url text,
  public_user_code text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select 'incoming'::text, r.id, r.requester_id,
         coalesce(sp.display_name, p.display_name), sp.avatar_url, p.public_user_code, r.created_at
  from public.friend_requests r
  join public.profiles p on p.id = r.requester_id
  left join public.social_profiles sp on sp.user_id = r.requester_id
  where r.addressee_id = auth.uid() and r.status = 'pending'
  union all
  select 'outgoing'::text, r.id, r.addressee_id,
         coalesce(sp.display_name, p.display_name), sp.avatar_url, p.public_user_code, r.created_at
  from public.friend_requests r
  join public.profiles p on p.id = r.addressee_id
  left join public.social_profiles sp on sp.user_id = r.addressee_id
  where r.requester_id = auth.uid() and r.status = 'pending'
  order by created_at desc;
$$;

revoke all on function public.list_community_friends() from public;
grant execute on function public.list_community_friends() to authenticated;
revoke all on function public.list_pending_friend_requests() from public;
grant execute on function public.list_pending_friend_requests() to authenticated;

-- ----------------------------------------------------------------------------
-- 9) بروفايل اجتماعي بالكود العام (MAG-XXX-XXXX) — بخصوصية مطبقة داخل الـRPC
-- ----------------------------------------------------------------------------

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
    sp.avatar_url, sp.cover_url, sp.bio,
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

  -- الحظر بأي اتجاه: لا بروفايل
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
    'university', case when v_show_academic then v_row.university end,
    'faculty', case when v_show_academic then v_row.faculty end,
    'major', case when v_show_academic then v_row.major end,
    'year', case when v_show_academic then v_row.year end,
    'interests', case when v_show_academic then to_jsonb(v_row.interests) end::text[],
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
