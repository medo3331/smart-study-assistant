-- ═════════════════════════════════════════════════════════════
-- 27-subscription-plans-egp.sql
-- Phase B1.1 — Pricing infrastructure
-- ═════════════════════════════════════════════════════════════
-- يضيف: credits_monthly (عدد الكريدت الشهري لكل باقة)
-- ويحوّل الأسعار إلى EGP، ويحذف باقة Desc50 غير المستخدمة.
--
-- ⚠️ BACKUP مطلوب قبل التطبيق (قاعدة Phase B1):
--   db/backups/subscription_plans-<timestamp>.json
--   النسخة المأخوذة في تدقيق B1: 4 صفوف.
--
-- ✅ Pre-flight (مُنفَّذ، SELECT فقط):
--   • price / price_monthly / original_price = numeric  ⇒ تعيين أعداد صحيحة آمن.
--   • currency = text.
--   • credits_monthly غير موجود بعد (هذا الملف ينشئه).
--   • FK إلى subscription_plans(plan_key) من:
--       subscription_activations.plan_key, subscription_quotas.plan_key
--   • عدد الصفوف المرجعية لـ Desc50 = 0 في الجدولين ⇒ الحذف آمن.
--
-- idempotent: ADD COLUMN IF NOT EXISTS + UPDATE مقيّد + DELETE بالمعرّف.
-- additive ثم destructive واحد مقيّد (Desc50) بأثر صفر مرجعي.
-- ═════════════════════════════════════════════════════════════

begin;

-- ١) عمود الكريدت الشهري — افتراضي 0 حتى لا تتغيّر دلالات الباقات القديمة.
alter table public.subscription_plans
  add column if not exists credits_monthly int not null default 0;

-- ٢) القيم الأولية والأسعار بالجنيه المصري (يمكن للأدمن تعديلها لاحقًا).
update public.subscription_plans
   set credits_monthly = case plan_key
         when 'free'  then 50
         when 'pro'   then 500
         when 'ultra' then 2000
         else credits_monthly
       end,
       currency = 'EGP',
       price = case plan_key
         when 'free'  then 0
         when 'pro'   then 199
         when 'ultra' then 399
         else price
       end,
       price_monthly = case plan_key
         when 'free'  then 0
         when 'pro'   then 199
         when 'ultra' then 399
         else price_monthly
       end
 where plan_key in ('free', 'pro', 'ultra');

-- ٣) حذف الباقة الغامضة غير المستخدمة (0 مرجع في activations/quotas).
--    مقيّد بمعرّف واحد، ولا يكسر أي FK قائم.
delete from public.subscription_plans
 where plan_key = 'Desc50'
   and not exists (select 1 from public.subscription_activations a where a.plan_key = 'Desc50')
   and not exists (select 1 from public.subscription_quotas q where q.plan_key = 'Desc50');

commit;

-- ٤) Verification
-- select plan_key, price, price_monthly, currency, credits_monthly, messages_daily, is_active
--   from public.subscription_plans order by plan_key;
-- المتوقع: free(0/0/EGP/50) · pro(199/199/EGP/500) · ultra(399/399/EGP/2000) — و3 صفوف فقط.
