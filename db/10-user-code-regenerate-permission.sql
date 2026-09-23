-- ============================================================
-- #10 — Phase 3 (QR): مفتاح صلاحية users.regenerate_code
-- ============================================================
-- ⚠️ يحتاج تشغيل يدوي في Supabase SQL Editor (idempotent — آمن للتكرار).
--
-- مهم: جدول admin_permission_keys مرجعي فقط (قراءة/توثيق — مش مفروض بقيد
-- DB، شوف db/epic2-admin-rbac-audit-schema.sql:77). الفرض الحقيقي بيحصل من
-- ADMIN_PERMISSION_MAP في lib/auth-roles.ts (الكود هو مصدر الحقيقة).
-- الصف ده بيحافظ على اتساق الجدول المرجعي مع الكود.
--
-- سلوك الأدوار بعد إضافة المفتاح (من منطق getAdminPermissions/hasPermission):
--   - Owner: بيعدّي دايمًا.
--   - Admin بدون permissions array صريح: بياخد المفتاح تلقائيًا من الـfallback
--     (الاستبعاد هناك للمفاتيح Owner-only بس).
--   - Admin بـ permissions array صريح في site_admins: رفض آمن (BLOCKED +
--     audit) لحد ما المفتاح يتضاف لصلاحياته من إدارة الأدمنز.

insert into public.admin_permission_keys (key, description, allowed_roles, is_sensitive) values
('users.regenerate_code', 'توليد/إعادة توليد كود المستخدم العام public_user_code (QR)', '{owner,admin}', true)
on conflict (key) do nothing;
