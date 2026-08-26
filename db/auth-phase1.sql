-- ============================================================================
-- المرحلة ١ — Auth & Onboarding Foundation
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor (تشغيله أكتر من مرة آمن).
--
-- قرار التصميم: «الدور» مش نظام جديد — هو اسم صريح للشخصية الموجودة.
-- profiles.persona هو المصدر الوحيد للحقيقة، و profiles.role عمود مولَّد
-- (generated) بيرجع نفس القيمة باسم الراوت: grad → graduate.
-- كده مستحيل يحدث تعارض بين عمودين، والـ assessment الحالي يفضل شغال
-- زي ما هو لأنه بيكتب في persona بالفعل.
-- ============================================================================

-- ١) الدور: عمود مولَّد من persona — لا يُكتب يدويًا أبدًا.
alter table public.profiles
  add column if not exists role text
  generated always as (
    case persona
      when 'grad' then 'graduate'
      else persona
    end
  ) stored;

-- ٢) علامة إتمام الأونبوردنج (null = لسه ما خلّصش).
alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- ملاحظات:
-- - لا حاجة لأي سياسة RLS جديدة: سياسات profiles الموجودة (قراءة عامة
--   لعرض لوحة الصدارة + تحديث للمالك فقط) بتغطي العمودين تلقائيًا.
-- - لا حاجة لـ trigger مزامنة: العمود مولَّد فبيتحدّث مع أي كتابة على persona
--   سواء من الأونبوردنج الجديد أو من صفحة الـ assessment الحالية.
