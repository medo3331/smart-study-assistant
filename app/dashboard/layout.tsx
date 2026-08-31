import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
/* كل صفحات الداشبورد ورا تسجيل دخول ومحتواها شخصي بالكامل (خطة المستخدم،
   تقدّمه، ملفاته). الميتاداتا هنا بتتوّرث لكل الراوتس تحت `/dashboard`،
   فالـ `noIndex` بيغطّيهم كلهم من مكان واحد بدل ما كل صفحة تفتكر تحطه.
   الصفحات اللي جوّه `'use client'` فمابتقدرش تصدّر metadata أصلاً.
   ⚠️ أي صفحة جديدة تحت /dashboard بتاخد ده أوتوماتيك — بس لو حطّيت
   `pageMeta()` فيها من غير `noIndex: true` هتلغي الوراثة دي. */
export const metadata: Metadata = pageMeta({
  title: 'مساحتك',
  description: 'خطتك وتقدّمك وملفاتك في مكان واحد.',
  path: '/dashboard',
  noIndex: true,
});

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}