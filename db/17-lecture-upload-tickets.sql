-- ═══════════════════════════════════════════════════════════════════════
-- 17-lecture-upload-tickets.sql — ربط تذاكر رفع المحاضرات بمالكها
-- Design Doc v3 — Fix #1 (IDOR في /api/lecture-transcription/transcribe)
--
-- ⚠️ ترتيب التطبيق الإلزامي:
--   1) نفّذ الملف ده على قاعدة الإنتاج (Supabase SQL Editor) **قبل** merge
--      الراوتات الجديدة — الراوتات بتقرا الجدول، ونشر الكود قبله يولّد 500
--      على /upload-url و /transcribe.
--   2) الملف idempotent — آمن لأكثر من تنفيذ.
--
-- ═════ التصميم (v3) ═════
--   ticket_id    : معرّف فقط (rate-limit key / ربط) — مش سر.
--   secret_hash  : SHA-256 لسر 32 بايت — للزائر بلا جلسة فقط. السر نفسه
--                  بيتصرف مرة واحدة في رد /upload-url ومش بيتخزن هنا أبدًا.
--   owner_user_id: مسجل أو زائر بجلسة anonymous (Supabase Anonymous Auth
--                  حقيقي — signInAnonymously في app/dashboard/page.tsx).
--                  null + secret_hash = زائر بلا جلسة (bearer secret).
--   claim_id     : حارس stale release — طلب قديم مش بيفك ولا يستهلك تذكرة
--                  استحوذ عليها طلب أحدث. مش بيمنع التكلفة المزدوجة (موثق).
--   status       : active → processing → consumed
--                  (release بيرجع processing → active عند فشل مؤقت،
--                   وclaim جديد جوّه lease منتهي مسموح).
--
-- RLS مفعّل بدون أي policy → الوصول الوحيد = service role (سيرفر بس).
-- anon key مش بيشوف الجدول خالص.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.upload_tickets (
  ticket_id             uuid primary key default gen_random_uuid(),
  storage_path          text not null unique,
  owner_user_id         uuid null references auth.users(id) on delete cascade,
  secret_hash           text null,
  status                text not null default 'active'
                        check (status in ('active','processing','consumed')),
  claim_id              uuid null,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null default now() + interval '2 hours',
  processing_started_at timestamptz,
  consumed_at           timestamptz,
  -- التذاكر إما مملوكة (بجلسة) أو حاملة سر — مش الاتنين معًا ولا لا شيء.
  constraint owner_or_secret_check
    check (
      (owner_user_id is not null and secret_hash is null)
      or
      (owner_user_id is null and secret_hash is not null)
    )
);

alter table public.upload_tickets enable row level security;
-- لا policies مقصودة: الجدول كله سيرفر-سايد (service role يتجاوز RLS).

-- الفهارس: الملكية (claim) + التنظيف الدفعي (expires_at).
-- storage_path متغطي بـ unique constraint فوق.
create index if not exists upload_tickets_owner_idx
  on public.upload_tickets (owner_user_id);
create index if not exists upload_tickets_expires_idx
  on public.upload_tickets (expires_at);

-- ═════ تنظيف محدود الدفعات (لا pg_cron — بنداء احتمالي من السيرفر) ═════
-- الدالة دي بيمسكها lib/ai/tickets.ts بنسبة ~5% من عمليات الإصدار:
-- تنظيف تذاكر انتهت صلاحيتها من أكتر من 7 أيام (استبقاء للتحقيق)،
-- دفعة 200 صف كحد أقصى لكل نداء — مش DELETE غير محدود على كل issue.
-- نُفِّذ يدويًا كمان دلوقتي للتشغيل الأول:
delete from public.upload_tickets
where ticket_id in (
  select ticket_id
  from public.upload_tickets
  where expires_at < now() - interval '7 days'
  order by expires_at
  limit 200
);
