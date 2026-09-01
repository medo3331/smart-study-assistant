-- ============================================================================
-- Phase G — AI Model Entitlements + Usage Policy (توثيق فقط)
-- التاريخ: ٢ سبتمبر ٢٠٢٦
--
-- الهدف:
--   توثيق أن Model Access Policy يُمثل عبر entitlements(kind, value) الحالي
--   بدون إنشاء جدول model_entitlements موازي
--
-- Policy:
--   kind="model", value="<model-id>"  → وصول لنموذج محدد
--   kind="feature", value="advanced-study" → ميزة عامة
--   كل الـ 6 models الحالية free — لا قفل في هذه المرحلة
--
-- Scope: additive فقط — لا تغيير XP/Coins/Credits pricing/Agents/Providers
-- شغّل مرة واحدة في Supabase SQL Editor (آمن للتكرار — لا تغيير فعلي)
-- يتطلب Phase D/E/F مطبقة
-- ============================================================================

-- لا جدول جديد — نستخدم entitlements الحالي
-- هذا الملف للتوثيق والـ idempotency فقط

-- تأكيد أن has_entitlement يعمل للـ model/feature (موجود من Phase D)
-- مثال اختبار (لا يُنفذ تلقائياً):
--   select has_entitlement(auth.uid(), 'model', 'openai/gpt-oss-120b'); -- false إذا لم يشترِ
--   select has_entitlement(auth.uid(), 'feature', 'advanced-study'); -- true إذا اشترى Study Booster

-- تأكيد أن ai_credit_ledger و reserve/refund موجودة (Phase F)
--   select reserve_ai_credit(auth.uid(), 'test-g-1');

-- لا تغيير في shop_catalog أو coin_ledger أو XP

-- للتحقق:
--   select * from entitlements where kind='model' limit 1;
--   select * from entitlements where kind='feature' and value='advanced-study' limit 1;
