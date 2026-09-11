-- ============================================
-- Magiclly — Push Subscriptions (multi-device)
-- جدول اشتراكات إشعارات الموبايل (Web Push)
-- ============================================
-- شغّل الملف مرة واحدة من Supabase → SQL Editor.
-- آمن للتشغيل المتكرر، وبيهاجر تلقائياً من السكيما القديمة
-- (صف واحد لكل مستخدم + عمود subscription بصيغة jsonb) لو موجودة.
--
-- التصميم: صف واحد لكل جهاز (endpoint فريد)، عشان نفس المستخدم
-- يقدر يستقبل على موبايله وتابلته ولابتوبه في نفس الوقت.
-- ============================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text,
  p256dh text,
  auth text,
  device_info jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- أعمدة ناقصة لو الجدول كان موجود بالسكيما القديمة
alter table public.push_subscriptions add column if not exists endpoint text;
alter table public.push_subscriptions add column if not exists p256dh text;
alter table public.push_subscriptions add column if not exists auth text;
alter table public.push_subscriptions add column if not exists device_info jsonb not null default '{}'::jsonb;
alter table public.push_subscriptions add column if not exists is_active boolean not null default true;
alter table public.push_subscriptions add column if not exists created_at timestamptz not null default now();
alter table public.push_subscriptions add column if not exists updated_at timestamptz not null default now();
alter table public.push_subscriptions add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- ترحيل الصفوف القديمة من عمود subscription (jsonb) للأعمدة الجديدة،
-- ثم حذف الصفوف اللي مافيهاش endpoint صالح + إسقاط العمود القديم.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_subscriptions'
      and column_name = 'subscription'
  ) then
    update public.push_subscriptions
    set endpoint = coalesce(endpoint, subscription->>'endpoint'),
        p256dh = coalesce(p256dh, subscription->'keys'->>'p256dh'),
        auth = coalesce(auth, subscription->'keys'->>'auth'),
        updated_at = now()
    where endpoint is null;

    delete from public.push_subscriptions where endpoint is null;
    alter table public.push_subscriptions drop column subscription;
  end if;
end $$;

-- إسقاط أي unique قديم على user_id وحده (كان بيمنع تعدد الأجهزة).
-- اسم الـ constraint بيختلف حسب طريقة إنشاء الجدول، فبندور عليه ديناميكياً.
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.push_subscriptions'::regclass
      and c.contype = 'u'
      and array_length(c.conkey, 1) = 1
      and c.conkey[1] = (
        select a.attnum from pg_attribute a
        where a.attrelid = 'public.push_subscriptions'::regclass
          and a.attname = 'user_id'
      )
  loop
    execute format('alter table public.push_subscriptions drop constraint %I', r.conname);
  end loop;
end $$;

-- تنظيف الـ endpoints المكررة قبل فرض التفرد (نحتفظ بالأحدث).
delete from public.push_subscriptions a
using public.push_subscriptions b
where a.endpoint is not null
  and a.endpoint = b.endpoint
  and (a.updated_at < b.updated_at or (a.updated_at = b.updated_at and a.id < b.id));

alter table public.push_subscriptions alter column endpoint set not null;
alter table public.push_subscriptions alter column p256dh set not null;
alter table public.push_subscriptions alter column auth set not null;
alter table public.push_subscriptions alter column user_id set not null;

do $$
begin
  alter table public.push_subscriptions
    add constraint push_subscriptions_endpoint_key unique (endpoint);
exception when duplicate_object then
  null;
end $$;

-- RLS: كل مستخدم يدير اشتراكاته هو بس.
-- (مسار الاشتراك بيكتب بـ service client عشان حالة تبديل الحسابات
-- على نفس الجهاز — الـ user_id دايماً من الجلسة، مش من الطلب.)
alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions: owner manages" on public.push_subscriptions;
create policy "push_subscriptions: owner manages"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);
create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions(user_id) where is_active;
