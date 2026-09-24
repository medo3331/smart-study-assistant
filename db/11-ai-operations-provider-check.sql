-- ============================================================
-- #11 — Phase 4.1: توسيع CHECK الخاص بـ ai_operations.provider
-- ============================================================
-- ⚠️ يحتاج تشغيل يدوي في Supabase SQL Editor (idempotent — آمن للتكرار).
--
-- المشكلة (موثقة في EPIC_AUDIT_REPORT.md): القيد الأصلي في
-- db/ai-operations.sql:5 يسمح بـ ('groq','gemini') فقط، بينما أنواع الكود
-- الفعلية (lib/ai/types.ts:6):
--   export type AiProviderName = "groq" | "nvidia" | "openrouter" | "gemini";
-- أي عملية nvidia/openrouter كانت تفشل عند الـinsert بصمت (recordAiOperation
-- في lib/ai/operations.ts:82 مجرد console.warn — best-effort بالتصميم)،
-- فتضيع بيانات الاستخدام الفعلية بهدوء.
--
-- الدليل من الـDB الحية: جدول ai_models يحتوي فعلًا على 4 providers مميزين:
-- gemini, openrouter, groq, nvidia — والقيد القديم كان سيمنع تسجيل عمليات
-- 3 منهم (الكل ما عدا gemini/groq).
--
-- الحل: إسقاط القيد القديم وإعادة إنشائه بالقائمة الكاملة المطابقة للـtype.
-- اسم القيد محفوظ (ai_operations_provider_check) حتى لا تتكسر أي إشارة له.

alter table public.ai_operations
  drop constraint if exists ai_operations_provider_check;

alter table public.ai_operations
  add constraint ai_operations_provider_check
  check (provider in ('groq', 'nvidia', 'openrouter', 'gemini'));

-- تحقق اختياري بعد التشغيل:
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.ai_operations'::regclass and conname = 'ai_operations_provider_check';
