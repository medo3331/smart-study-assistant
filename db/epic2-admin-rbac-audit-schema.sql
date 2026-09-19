-- ============================================================
-- EPIC-2 — Admin Panel + RBAC + Audit Log
-- Prerequisites DB Schema — CREATED 2026-09-19
-- ============================================================
-- ASSUMPTIONS (user didn't answer open questions — documented defaults):
-- 1. Dashboard: basic stats (users active / requests / uploads / top plans)
-- 2. Support CAN read Audit Log (conservative default)
-- 3. CSV Export: included in first version (not deferred)
-- 4. Ultra storage cap: 20GB total + 1GB/file
-- 5. Daily reset: midnight Egypt time (EET)
-- 6. Bulk edit: multiple fields allowed
-- 7. File versioning on Replace: deferred (future version)
-- 8. Personality override (exam time): deferred to EPIC-5
-- 9. Age question: optional in onboarding (EPIC-5 scope)
-- ============================================================

-- 1) Audit Log — MANDATORY for EPIC-2 (any sensitive action)
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,              -- permission key: users.read, users.ban, plans.manage, etc.
  resource_type text not null,      -- user, plan, subscription, model, admin
  resource_id text,                 -- user_id, plan_name, code, etc.
  details jsonb default '{}',       -- extra context (reason for ban, plan duration, etc.)
  timestamp timestamptz not null default now(),
  result text not null check (result in ('PASS', 'FAIL', 'BLOCKED'))
);

create index if not exists idx_audit_log_actor on public.audit_log(actor);
create index if not exists idx_audit_log_action on public.audit_log(action);
create index if not exists idx_audit_log_timestamp on public.audit_log(timestamp desc);
create index if not exists idx_audit_log_resource on public.audit_log(resource_type, resource_id);

-- RLS: only admins can read/write audit log (no client writes directly)
alter table public.audit_log enable row level security;

drop policy if exists "audit_log: admin read" on public.audit_log;
create policy "audit_log: admin read"
  on public.audit_log for select
  using (exists(select 1 from public.site_admins where site_admins.user_id = auth.uid()));

drop policy if exists "audit_log: no client insert" on public.audit_log;
create policy "audit_log: no client insert"
  on public.audit_log for insert
  with check (false);

drop policy if exists "audit_log: no client update" on public.audit_log;
create policy "audit_log: no client update"
  on public.audit_log for update
  using (false);

drop policy if exists "audit_log: no client delete" on public.audit_log;
create policy "audit_log: no client delete"
  on public.audit_log for delete
  using (false);

-- 2) Extend site_admins with RBAC permission keys + support role
-- Note: existing site_admins has role in ('admin','owner'). We extend.

alter table public.site_admins add column if not exists permissions text[] default '{}';

-- Add support role support (if missing — safe idempotent check)
-- We do NOT alter the check constraint directly (could break); instead document:
-- New roles handled at application layer via getAdminRole() + permissions array.
-- Support role is represented by: role='admin' + permissions includes 'support'
-- OR we can add a separate entry. Per spec: Owner/Admin/Support are 3 roles.
-- For simplicity: keep site_admins.role as enum + add support via permissions array.

alter table public.site_admins add column if not exists permissions_description text default '';

create index if not exists idx_site_admins_permissions on public.site_admins using gin(permissions);

-- Update admin-roles index (if needed)
create index if not exists site_admins_role_idx on public.site_admins(role);

-- 3) RBAC Permission Keys reference table (read-only reference, not enforced by DB constraint)
create table if not exists public.admin_permission_keys (
  key text primary key,
  description text not null,
  allowed_roles text[] default '{owner,admin,support}',
  is_sensitive boolean default false
);

insert into public.admin_permission_keys (key, description, allowed_roles, is_sensitive) values
('users.read', 'قراءة بيانات المستخدمين', '{owner,admin,support}', false),
('users.ban', 'حظر/فك حظر مستخدم', '{owner,admin}', true),
('users.unban', 'فك حظر مستخدم', '{owner,admin}', true),
('users.impersonate', 'مشاهدة كمستخدم (view-as)', '{owner,admin}', true),
('plans.manage', 'إدارة الخطط', '{owner,admin}', true),
('trial.manage', 'إدارة التجربة المجانية', '{owner,admin,support}', true),
('models.manage', 'إدارة نماذج الذكاء الاصطناعي', '{owner}', true),
('rewards.manage', 'إدارة المكافآت الأسبوعية', '{owner,admin}', true),
('admins.manage', 'إضافة/تعطيل أدمن', '{owner}', true),
('files.moderate', 'إدارة الملفات (تصنيف، حذف)', '{owner,admin,support}', true),
('audit.read', 'قراءة سجل العمليات الحساسة', '{owner,admin,support}', false),
('subscriptions.manage', 'إدارة الاشتراكات', '{owner,admin}', true)
on conflict (key) do nothing;

-- 4) User Code table (EPIC-6 — linked to EPIC-2 activation flow)
create table if not exists public.user_codes (
  code text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  is_active boolean default true,
  activated_by uuid references auth.users(id) on delete set null,
  activation_note text
);

create index if not exists idx_user_codes_user on public.user_codes(user_id);
create index if not exists idx_user_codes_active on public.user_codes(is_active) where is_active = true;

-- 5) Subscriptions / Plans reference (basic — for admin panel lookup)
-- Note: full plans table (EPIC-3) will extend this; this is minimal for EPIC-2.
-- FIX: If table exists with wrong schema, add missing columns (robust for partial runs).
create table if not exists public.subscription_plans (
  plan_key text primary key,
  name text not null,
  display_name_ar text,
  profile_limit int not null default 1,
  messages_per_2h int not null default 20,
  uploads_daily int not null default 5,
  max_file_size_mb int not null default 20,
  file_types text[] default '{pdf,text,image}',
  video_audio_exclusive boolean default false,
  priority_queue text default 'normal',
  trial_days int default 0,
  is_active boolean default true
);

-- Robust fix: if subscription_plans exists but missing plan_key column, recreate safely.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscription_plans' AND column_name='plan_key') THEN
    -- Column exists — safe to proceed
  ELSE
    -- Column missing — table likely wrong schema; drop and recreate
    DROP TABLE IF EXISTS public.subscription_plans;
  END IF;
END $$;

create table if not exists public.subscription_plans (
  plan_key text primary key,
  name text not null,
  display_name_ar text,
  profile_limit int not null default 1,
  messages_per_2h int not null default 20,
  uploads_daily int not null default 5,
  max_file_size_mb int not null default 20,
  file_types text[] default '{pdf,text,image}',
  video_audio_exclusive boolean default false,
  priority_queue text default 'normal',
  trial_days int default 0,
  is_active boolean default true
);


insert into public.subscription_plans (plan_key, name, display_name_ar, profile_limit, messages_per_2h, uploads_daily, max_file_size_mb, file_types, video_audio_exclusive, priority_queue, trial_days, is_active) values
('free', 'Free', 'مجاني', 1, 20, 5, 20, '{pdf,text,image}', false, 'normal', 0, true),
('pro', 'Pro', 'احترافي', 3, 100, 30, 150, '{pdf,text,image}', false, 'normal', 30, true),
('ultra', 'Ultra', 'ألتميت', 5, 500, 60, 1024, '{pdf,text,image,video,audio}', true, 'high', 0, true)
on conflict (plan_key) do nothing;

-- 6) Manual subscription activation log (linked to audit_log, separate for quick lookup)
create table if not exists public.subscription_activations (
  id uuid primary key default gen_random_uuid(),
  user_code text not null references public.user_codes(code),
  user_id uuid not null references auth.users(id),
  plan_key text not null references public.subscription_plans(plan_key),
  duration_days int not null,
  activated_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id)
);

create index if not exists idx_sub_activations_user on public.subscription_activations(user_id);
create index if not exists idx_sub_activations_code on public.subscription_activations(user_code);
