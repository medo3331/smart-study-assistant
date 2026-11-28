-- ═══════════════════════════════════════════════════════════════════════════
-- 57-ai-personas.sql — Phase 1: Persona Orchestrator
-- تعريف شخصيات الذكاء الاصطناعي في Magicly + أعمدة التوجيه في سجل الاستخدام
-- ═══════════════════════════════════════════════════════════════════════════
-- الهدف:
--   1) جدول ai_personas = مصدر الحقيقة لشخصيات النظام (magic / tutor / play / coach).
--      الكود الحالي يستخدم سجل ثابت في lib/magic/personas.ts — الجدول للقراءة
--      والتحكم (تفعيل/إيقاف) لاحقًا بدون نشر جديد.
--   2) أعمدة persona_id وrouting_reason في ai_usage_events لتتبع مين رد
--      وليه اتوجه الطلب (Phase 1 لا يخصم حسب الشخصية — الخصم على التنفيذ فقط).
--
-- ⚠️ تسمية: profiles.persona موجود بالفعل لكنه نوع المستخدم (student/grad/…)
--    وليس شخصية AI — لا علاقة بينهما. ai_personas منفصل تمامًا.
--
-- idempotent + additive: لا يعدّل أي جدول موجود بغير إضافة أعمدة.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) جدول الشخصيات
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ai_personas (
  id         text primary key,
  name       text not null,
  tagline    text,
  emoji      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.ai_personas enable row level security;

-- القراءة عامة (تعريفات ثابتة بدون بيانات مستخدمين) — الكتابة من service_role فقط.
drop policy if exists "ai_personas_public_select" on public.ai_personas;
create policy "ai_personas_public_select"
  on public.ai_personas
  for select
  to anon, authenticated
  using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) بيانات الشخصيات الأربعة
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.ai_personas (id, name, tagline, emoji, is_active) values
  ('magic', 'Magic', 'صديقك ومرشدك الأكاديمي في Magicly', '⚡', true),
  ('tutor', 'Tutor', 'معلمك المتخصص في شرح المحتوى العلمي', '📚', true),
  ('play',  'Play',  'رفيقك في الترفيه والألعاب والتحديات', '🎮', true),
  ('coach', 'Coach', 'مخططك الأكاديمي ومتابع تقدمك', '🎯', true)
on conflict (id) do update
  set name    = excluded.name,
      tagline = excluded.tagline,
      emoji   = excluded.emoji,
      is_active = excluded.is_active;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) أعمدة التوجيه في ai_usage_events (تتبّع الشخصية وسبب اختيارها)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.ai_usage_events
  add column if not exists persona_id text,
  add column if not exists routing_reason text;

create index if not exists ai_usage_events_persona_idx
  on public.ai_usage_events (persona_id)
  where persona_id is not null;
