import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';

/* ==========================================================================
   العنوان الديناميكي لصفحة الدرس.

   ═══ ليه العنوان بيتغيّر لو الصفحة أصلاً noindex ═══
   العنوان مش لجوجل هنا — هو للمستخدم. الطالب بيفتح تلات دروس في تلات
   تابات، ولو التلاتة اسمهم «الدرس · ماجيكلي» مش هيعرف يفرّق. كمان
   الـ history والبوكماركس بيتسجّلوا بالعنوان ده.

   ═══ ليه رقم اليوم مش عنوان الدرس ═══
   عنوان الدرس الحقيقي في Supabase (`study_days.title`) ورا صلاحيات
   المستخدم. جلبه هنا معناه استعلام على السيرفر لكل تحميل صفحة قبل ما
   الصفحة نفسها تبدأ ترسم — تكلفة حقيقية عشان نص في تاب. `dayId` موجود
   في الـ URL ببلاش، فبنستخدمه.
   ========================================================================== */

type Props = { params: Promise<{ dayId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dayId } = await params;

  /* الـ dayId جاي من الـ URL يعني مدخل من المستخدم — بينضّف قبل ما
     يتحط في العنوان. أرقام بس، وبحد أقصى ٤ خانات. أي حاجة تانية
     بترجّع العنوان العام بدل ما تحقن نص عشوائي في `<title>`. */
  const clean = /^\d{1,4}$/.test(dayId) ? dayId : null;

  return pageMeta({
    title: clean ? `اليوم ${clean}` : 'الدرس',
    description: 'الشرح والتمارين بتاعة اليوم ده من خطة مذاكرتك.',
    path: `/lesson/${dayId}`,
    /* محتوى شخصي ورا تسجيل دخول */
    noIndex: true,
  });
}

export default function LessonLayout({ children }: { children: React.ReactNode }) {
  return children;
}
