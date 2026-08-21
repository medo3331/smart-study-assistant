import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';

/* صفحة إجراء مش صفحة محتوى: مفيش حاجة فيها حد يدوّر عليها في جوجل،
   والنتيجة الوحيدة من فهرستها إن حد يوصل لشاشة دخول بدل ما يوصل
   للمحتوى. `noIndex` مع `follow` عشان اللينكات اللي فيها (الشروط
   والخصوصية والرجوع للرئيسية) تفضل تتزحف عادي. */
export const metadata: Metadata = pageMeta({
  title: 'تسجيل الدخول',
  description: 'ادخل على حسابك في ماجيكلي وكمّل من حيث ما وقفت.',
  path: '/login',
  noIndex: true,
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
