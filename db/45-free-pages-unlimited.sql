-- db/45-free-pages-unlimited.sql
--
-- 📄 صفحات النوته بلا حد لكل الخطط — قرار صاحب المشروع:
--   حد الصفحات (10/يوم للمجاني) كان بيمنع الطلاب من الاستفادة
--   الفعلية من الميزة. النوته local-first أصلاً — الحد كان اقتصادي
--   وديبلوماسي، واتشال بالكامل. الـ AI لسه محجوز للمشتركين.
--
-- ① صفحات subscription_plans → null (بلا حد) لكل الخطط.
-- ② تصفير عداد pages_24h عند أي مستخدم عالق.

update public.subscription_plans
  set pages_daily = null
  where pages_daily is not null;

update public.subscription_quotas
  set pages_24h = 0
  where pages_24h > 0;

notify pgrst, 'reload schema';
