-- ═══════════════════════════════════════════════════════════════════════════
-- 58-ai-persona-sessions.sql — Phase 2: Character Intelligence
-- سياق الشخصية داخل المحادثة (Persona Stickiness)
-- ═══════════════════════════════════════════════════════════════════════════
-- الهدف:
--   صف واحد لكل محادثة يسجّل الشخصية النشطة (آخر شخصية ردّت) وسبب توجيهها.
--   لما الطالب يتابع نفس الموضوع برسالة محايدة («تمام كمّل»)، نفس الشخصية
--   تكمّل معاه بدل ما التوجيه يرجع لـ Magic كل مرة.
--
-- ⚠️ conversation_id نص (مش uuid FK) عشان الـ route بيقصّه لـ 80 حرفًا
--    ويتعامل مع معرّفات من مصادر متعددة — ولا نريد فشل الكتابة على cast.
--
-- idempotent + additive.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.ai_persona_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null,
  persona_id     text not null,
  routing_reason text,
  updated_at     timestamptz not null default now(),
  unique (conversation_id)
);

create index if not exists ai_persona_sessions_user_idx
  on public.ai_persona_sessions (user_id);

alter table public.ai_persona_sessions enable row level security;

drop policy if exists "Users read own persona sessions" on public.ai_persona_sessions;
create policy "Users read own persona sessions"
  on public.ai_persona_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);

-- الكتابة من السيرفر فقط (service_role يتجاوز RLS) — المستخدم لا يعدّل يدويًا.
