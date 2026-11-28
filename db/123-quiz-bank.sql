-- ============================================================================
-- db/123 — بنك الأسئلة الجاهزة (مركز العبادات — تسريع الأسئلة الدينية)
-- القرار: توليد الأسئلة عبر Groq بياخد ٣٠–٦٠+ ثانية وممكن يضرب timeout على
--         Vercel. الحل: بنك أسئلة جاهزة (مجموعات من ١٠ أسئلة بنفس شكل
--         StoredQuestion في app/api/worship/quiz/route.ts) — generate يقرأ
--         منه فوراً، ولو البنك فاضي يرجع للمسار المباشر (Groq) زي ما هو.
--
-- ── إيه اللي الملف ده بيبنيه ──
--  ١) جدول worship_quiz_bank — كل صف = مجموعة أسئلة كاملة (١٠ عناصر jsonb).
--     ⚠️ مفيش أي صلاحية للكلاينت: RLS مُفعّل بدون أي policy → القراءة والكتابة
--        عبر service-role client حصراً (نمط app/api/worship/reminders/route.ts
--        مع lib/supabase/admin.ts). الأسئلة بالمواضع الصحيحة داخلها (correct)
--        فممنوع تسرّبها للكلاينت — الكلاينت بيستلم نسخة مفلترة من الـ route.
--  ٢) عمود bank_id على worship_quiz_sessions (ADD COLUMN IF NOT EXISTS) —
--     إثبات مصدر الجلسة عشان نتجنب تكرار نفس المجموعة لنفس المستخدم
--     (آخر ٣ جلسات). nullable — الجلسات المولّدة مباشرة (Groq) بتبقى null.
--
-- ⚠️ التوافق مع db/120 و db/121:
--    • ماتلمسش أعمدة worship_quiz_sessions الموجودة (user_id/questions/
--      completed_at) — دي عقد الإثبات لفرع worship_quiz في award_coins (db/121).
--    • التطبيق بعد db/120 و db/121. idempotent بالكامل — BEGIN/COMMIT واحد.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- ١) جدول بنك الأسئلة — لا policies إطلاقاً (service-role فقط)
--    questions: نفس شكل StoredQuestion بالظبط —
--    [{question, options:[4], correct:0..3, source, explanation}]
--    used_count / last_used_at: لاختيار "الأقل استخداماً" عند التوزيع.
-- ----------------------------------------------------------------------------
create table if not exists public.worship_quiz_bank (
  id uuid primary key default gen_random_uuid(),
  questions jsonb not null,
  model text,
  created_at timestamptz not null default now(),
  used_count int not null default 0,
  last_used_at timestamptz
);

alter table public.worship_quiz_bank enable row level security;

-- فهرس الاختيار: الأقل استخداماً أولاً (last_used_at nulls first, used_count asc)
create index if not exists worship_quiz_bank_lru_idx
  on public.worship_quiz_bank (last_used_at asc nulls first, used_count asc);

-- ----------------------------------------------------------------------------
-- ٢) ربط الجلسة بمجموعة البنك — nullable (المسار المباشر مالوش bank_id)
-- ----------------------------------------------------------------------------
alter table public.worship_quiz_sessions
  add column if not exists bank_id uuid
  references public.worship_quiz_bank(id) on delete set null;

commit;
