/**
 * ✦ صفحة الميزات الكاملة — ذراع من أذرع اللاندينج.
 *
 * ═══ ليه الصفحة دي موجودة ═══
 * اللاندينج بقت «محور» بتوري أول ٦ ميزات كملخّص، ولينك «شوف كل الميزات»
 * بيودّي هنا. الاتناشر كلهم بيتعرضوا هنا بنفس مكوّن `FeaturesSection`
 * (بـ `asPage`) — نفس البيانات، مفيش نسخة تانية تتحدّث لوحدها.
 *
 * ═══ ليه سيرفر كومبوننت ═══
 * الصفحة بتصدّر `metadata` (لازم تكون سيرفر)، وبتمرّر القسم الكلاينت
 * كـ children للغلاف. المحتوى نفسه (النصوص، الحركة) جوّه `FeaturesSection`.
 *
 * ⚠️ لو اتشالت الصفحة دي أو اتغيّر مسارها، لازم تتشال/تتعدّل في
 * `app/sitemap.ts` وفي لينكات الفوتر (`components/SiteFooter.tsx`).
 */

import type { Metadata } from 'next';
import { SubPageShell } from '@/components/SubPageShell';
import { FeaturesSection } from '@/components/FeaturesSection';
import { JsonLd } from '@/components/JsonLd';
import { pageMeta, breadcrumbLd } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'كل الميزات',
  description:
    'الاتناشر ميزة في ماجيكلي: يفهم ملفاتك، خطة على قد وقتك، الشرح بأربع طرق، كويز، قراءة الصور، عرض شرائح، ومتابعة تقدّمك — في مكان واحد.',
  path: '/features',
});

export default function FeaturesPage() {
  // SSR fallback content — يظهر فورًا دون انتظار hydration من SubPageShell / FeaturesSection
  const ssrFeatures = [
    { title: "يفهم ملفاتك", desc: "ارفع PDF أو Word مرة واحدة، ويفضل مرجع دائم." },
    { title: "خطة على قد وقتك", desc: "قول التراك وعندك كام يوم، وتطلع خطة بمواضيع مرتبة." },
    { title: "الدرس بأربع طرق", desc: "مبسّط، أكاديمي، بتشبيهات، أو مثال عملي." },
    { title: "كويز في آخر كل درس", desc: "أسئلة على اللي لسه قريته، واليوم ما بيتقفلش غير لما تعدّي." },
    { title: "صوّر المحاضرة", desc: "صورة السبورة أو الورقة بتتحوّل نص مقروء." },
    { title: "عرض شرائح", desc: "من موضوع لعرض تستعرضه بالكيبورد." },
  ];
  return (
    <>
      {/* SSR visible content — لا يعتمد على hydration */}
      <section aria-label="محتوى الميزات — تحميل أولي" className="sr-visible-ssr">
        <h1>كل أدوات مذاكرتك في مكان واحد</h1>
        <p>اسأل بالعربي أو بالإنجليزي — المصطلحات التقنية بتفضل زي ما هي في المراجع.</p>
        <ul>
          {ssrFeatures.map((f) => (
            <li key={f.title}><strong>{f.title}</strong> — {f.desc}</li>
          ))}
        </ul>
      </section>
      <JsonLd
        data={breadcrumbLd([
          { name: 'الرئيسية', path: '/' },
          { name: 'الميزات', path: '/features' },
        ])}
      />
      <SubPageShell>
        <FeaturesSection asPage />
      </SubPageShell>
    </>
  );
}
