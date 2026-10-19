-- Referral system — نظام الإحالة
-- الملف ده مرجع للـ migration المطبّق على Project1 (referral_system_base).
-- الجداول الفعلية اتعملت عبر apply_migration عشان unique index + backfill
-- محتاجين معاملة single transaction واحدة.

-- ١) profiles.referral_code — كود فريد لكل مستخدم (من غير I,O,0,1):
--      alter table public.profiles add column if not exists referral_code text;
--      + generate_referral_code() + backfill + unique index + trigger trg_set_referral_code (INSERT فقط)

-- ٢) referrals — (referrer_id, referee_id, referral_code, status signed_up|rewarded):
--      + unique(referee_id) + check لا إحالة ذاتية
--      + attribute_referral(p_code) — SECURITY DEFINER: تحقق + إدراج idempotent
--      + سياسات: الداعي يقرا دعواته / الأدمنز يقرأوا الكل (الإدراج عبر الـ RPC بس)

-- ٣) coin_source_rules: صف 'referral_reward' (مقفول is_live=false لحد تثبيت نوع المكافأة)
