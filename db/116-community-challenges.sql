-- ============================================================================
-- 116 — COMMUNITY CHALLENGES (C14)
-- تحديات المجتمع: فعالية أسبوعية مربوطة بالبوستات + جوائز كوينز
-- ----------------------------------------------------------------------------
-- بيبنى على:
--   community_posts / community_hashtags / community_post_hashtags (db/101)
--   coin_source_rules + award_coins (db/113 — economy truth)
--   site_admins + is_site_admin (الأدمن الحالي)
--
-- ── إيه اللي الملف ده بيبنيه ──
--   ١) مصدر كوينز جديد 'challenge' (مكافأة الفوز — 50 كوين، مرة/يوم)
--   ٢) community_challenges          — التحديات نفسها (هاشتاج + نافذة + جائزة)
--   ٣) community_challenge_entries   — المشاركات (مستخدم × تحدي، صف واحد)
--   ٤) تتبّع تلقائي: أي منشور عام فيه هاشتاج التحدي أثناء النافذة بيتسجل
--      كمشاركة عبر trigger — بدون أي خطوة يدوية من الطالب
--   ٥) RPCs: join / قائمة نشطة / لوحة صدارة التحدي / اختيار الفائز (أدمن)
--
-- ── الأمان ──
--   الجداول مقفولة تمامًا (RLS مفعّل بدون سياسات) — كل القراءة والكتابة
--   عبر RPCs security definer بنفس نمط C2/C4. اختيار الفائز للأدمن بس.
-- ============================================================================

-- ١) مصدر الكوينز — on conflict do nothing عشان ما نغطّيش على أي قرار
--    اقتصادي جه من db/113 (الملف المرجعي للاقتصاد).
insert into public.coin_source_rules (id, amount, daily_cap, is_live)
values ('challenge', 50, 1, true)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- ٢) التحديات
-- ----------------------------------------------------------------------------
create table if not exists public.community_challenges (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  description  text not null default '',
  emoji        text not null default '🏆',
  hashtag      text not null,  -- بدون # — بنفس شكل community_hashtags.tag
  reward_coins int  not null default 50 check (reward_coins between 0 and 1000),
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz not null,
  status       text not null default 'active'
               check (status in ('active','ended','cancelled')),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists idx_community_challenges_active
  on public.community_challenges (status, ends_at desc);

-- ----------------------------------------------------------------------------
-- ٣) المشاركات — صف واحد لكل (تحدي × مستخدم)
-- ----------------------------------------------------------------------------
create table if not exists public.community_challenge_entries (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.community_challenges (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  post_id      uuid references public.community_posts (id) on delete set null,
  status       text not null default 'joined'
               check (status in ('joined','submitted','winner')),
  joined_at    timestamptz not null default now(),
  submitted_at timestamptz,
  unique (challenge_id, user_id)
);

create index if not exists idx_challenge_entries_challenge
  on public.community_challenge_entries (challenge_id, joined_at);

-- عمود الفائز بيتضاف بعد ما الجدولين يبقوا موجودين (الترتيب مهم للـ FK)
alter table public.community_challenges
  add column if not exists winner_entry uuid
  references public.community_challenge_entries (id) on delete set null;

-- ----------------------------------------------------------------------------
-- ٤) RLS — مقفولة تمامًا (نمط C2): كل الوصول عبر RPCs
-- ----------------------------------------------------------------------------
alter table public.community_challenges        enable row level security;
alter table public.community_challenge_entries enable row level security;

-- ----------------------------------------------------------------------------
-- ٥) التتبّع التلقائي — أي منشور عام فيه هاشتاج تحدي نشط بيتسجل مشاركة
-- ----------------------------------------------------------------------------
create or replace function public._link_post_to_challenges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post   public.community_posts;
  v_ch     public.community_challenges;
begin
  select * into v_post from public.community_posts where id = new.post_id;
  if v_post.id is null or v_post.visibility <> 'public' then
    return new;
  end if;

  for v_ch in
    select c.* from public.community_challenges c
    join public.community_hashtags h on h.tag = c.hashtag
    where h.id = new.hashtag_id
      and c.status = 'active'
      and now() between c.starts_at and c.ends_at
  loop
    insert into public.community_challenge_entries (challenge_id, user_id, post_id, status, submitted_at)
    values (v_ch.id, v_post.author_id, v_post.id, 'submitted', now())
    on conflict (challenge_id, user_id) do update
      set post_id      = excluded.post_id,
          status       = 'submitted',
          submitted_at = now();
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_post_hashtag_links_challenges on public.community_post_hashtags;
create trigger trg_post_hashtag_links_challenges
  after insert on public.community_post_hashtags
  for each row execute function public._link_post_to_challenges();

-- ----------------------------------------------------------------------------
-- ٦) RPCs — القراءة والانضمام
-- ----------------------------------------------------------------------------

-- الانضمام لتحدي نشط (قبل ما تنشر مشاركتك — بيفتح لك التتبع)
create or replace function public.join_community_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if not exists (
    select 1 from public.community_challenges
    where id = p_challenge_id and status = 'active'
      and now() between starts_at and ends_at
  ) then
    return jsonb_build_object('ok', false, 'code', 'not_active');
  end if;

  insert into public.community_challenge_entries (challenge_id, user_id)
  values (p_challenge_id, v_me)
  on conflict (challenge_id, user_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

-- قائمة التحديات النشطة + تقدّمي فيها (العداد، مشاركتي، رابط منشوري)
create or replace function public.active_community_challenges()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',           c.id,
      'slug',         c.slug,
      'title',        c.title,
      'description',  c.description,
      'emoji',        c.emoji,
      'hashtag',      c.hashtag,
      'reward_coins', c.reward_coins,
      'ends_at',      c.ends_at,
      'participants', (select count(*) from public.community_challenge_entries e where e.challenge_id = c.id),
      'entries',      (select count(*) from public.community_challenge_entries e where e.challenge_id = c.id and e.status in ('submitted','winner')),
      'my_entry', case when m.user_id is null then null
                       else jsonb_build_object('status', m.status, 'post_id', m.post_id) end
    ) order by c.ends_at asc)
    from public.community_challenges c
    left join public.community_challenge_entries m
      on m.challenge_id = c.id and m.user_id = v_me
    where c.status = 'active' and now() between c.starts_at and c.ends_at
  ), '[]'::jsonb);
end;
$$;

-- لوحة صدارة تحدي: أعلى المشاركات لايكات (بتحسب لايكات المنشور المرتبط لايف)
create or replace function public.challenge_leaderboard(p_challenge_id uuid, p_limit int default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id',      e.user_id,
      'display_name', coalesce(sp.display_name, 'طالب'),
      'handle',       sp.handle,
      'avatar_url',   sp.avatar_url,
      'post_id',      e.post_id,
      'post_body',    left(p.body, 140),
      'likes',        (select count(*) from public.community_post_likes l where l.post_id = e.post_id),
      'is_winner',    (e.status = 'winner'),
      'submitted_at', e.submitted_at
    ) order by 6 desc nulls last, e.submitted_at asc)
    from (select * from public.community_challenge_entries
          where challenge_id = p_challenge_id
            and status in ('submitted','winner')
          limit greatest(p_limit, 1) * 5) e
    left join public.community_posts p on p.id = e.post_id
    left join public.social_profiles sp on sp.user_id = e.user_id
    order by 6 desc nulls last, e.submitted_at asc
    limit greatest(p_limit, 1)
  ), '[]'::jsonb);
end;
$$;

-- ----------------------------------------------------------------------------
-- ٧) RPC الأدمن — اختيار الفائز + صرف الجائزة (نفس نمط C4: is_site_admin
--    أو service_role من API مُصرّح)
-- ----------------------------------------------------------------------------
create or replace function public.pick_challenge_winner(p_challenge_id uuid, p_entry_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_entry   public.community_challenge_entries;
  v_ch      public.community_challenges;
  v_awarded int;
begin
  if not public.is_site_admin() and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;

  select * into v_entry from public.community_challenge_entries where id = p_entry_id;
  if v_entry.id is null or v_entry.challenge_id <> p_challenge_id then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select * into v_ch from public.community_challenges where id = p_challenge_id;
  if v_ch.id is null or v_ch.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'code', 'not_active');
  end if;

  -- إلغاء فائز سابق (لو الالتقاط اتعدل)
  update public.community_challenge_entries set status = 'submitted'
  where challenge_id = p_challenge_id and status = 'winner';

  update public.community_challenge_entries set status = 'winner'
  where id = p_entry_id;

  update public.community_challenges set winner_entry = p_entry_id
  where id = p_challenge_id;

  -- صرف الجائزة عبر المسار المركزي (ref = التحدي) — قاعدة 'challenge'
  -- متسجلة في coin_source_rules بأعلى. لو المبلغ انعطل حصل capped=true.
  begin
    select awarded into v_awarded from public.award_coins(
      'challenge', p_challenge_id::text,
      jsonb_build_object('challenge_slug', v_ch.slug, 'entry_id', p_entry_id)
    );
  exception when others then
    v_awarded := 0;
  end;

  return jsonb_build_object('ok', true, 'coins_awarded', v_awarded);
end;
$$;

grant execute on function public.join_community_challenge(uuid)      to authenticated;
grant execute on function public.active_community_challenges()       to authenticated;
grant execute on function public.challenge_leaderboard(uuid, int)    to authenticated;
grant execute on function public.pick_challenge_winner(uuid, uuid)   to authenticated, service_role;
revoke execute on function public._link_post_to_challenges()         from anon, authenticated;

-- ----------------------------------------------------------------------------
-- ٨) تحديات جاهزة للإطلاق — أسبوعين قدام
-- ----------------------------------------------------------------------------
insert into public.community_challenges (slug, title, description, emoji, hashtag, reward_coins, ends_at)
values
  ('summary-showdown', 'تحدي الملخص الأفضل', 'انشر أحسن ملخص دراستك الأسبوع ده بالهاشتاج — الأكثر لايكات يكسب 50 كوين 🪙', '📚', 'أحسن_ملخص', 50, now() + interval '7 days'),
  ('question-master',  'سيد الأسئلة',          'اطرح أذكى سؤال أكاديمي عندك — السؤال اللي يجمع أكتر تفاعل يكسب!', '❓', 'سؤال_ذكي', 50, now() + interval '14 days'),
  ('study-streak',     'تحدي الـ 7 أيام',      'ذاكر 7 أيام متتالية ووثّق رحلتك بالهاشتاج — انتظامك بيتكافأ', '🔥', 'تحدي_7_ايام', 50, now() + interval '21 days')
on conflict (slug) do nothing;
