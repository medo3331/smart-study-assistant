-- ============================================================
-- Phase D / Step 1 & 2 — Subscriptions DB Fixes + System Settings
-- created: 2026-10-18
-- ============================================================
-- الشرح:
-- 1) Table system_settings: مفتاح تحكم (Master Switch) لتفعيل/تعطيل
--    الاشتراكات والدفع على مستوى المنصة.
-- 2) Fix: subscription_activations.user_code DROP NOT NULL
--    (لتمكين التفعيل عبر الإيميل فقط بدون كود مستخدم).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Table: system_settings (مفاتيح التحكم generales للمنصة)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  description text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- مفاتيح افتراضية (آمنة: الاشتراكات والدفع مفعلة افتراضياً)
insert into public.system_settings (key, value, description) values
  ('is_subscriptions_enabled', 'true', 'هل نظام الاشتراكات مفعل عالمياً (Master Switch)'),
  ('is_payments_enabled', 'true', 'هل نظام الدفع مفعل عالمياً (Master Switch)')
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Fix: جعل user_code يقبل NULL في subscription_activations
-- ─────────────────────────────────────────────────────────────
-- السبب: عند التفعيل بالإيميل فقط (بدون user_code)، Postgres يرفض
-- الإدخال لأن العمود مُعرف كـ NOT NULL. الإيميل هو المسار الأساسي الآن.
alter table public.subscription_activations alter column user_code drop not null;

-- فهرس للبحث السريع عبر user_code (بما أنnullable، الفهرس لا يتأثر)
create index if not exists idx_sub_activations_user_code_nullable on public.subscription_activations(user_code) where user_code is not null;

-- ============================================================
-- end
-- ============================================================