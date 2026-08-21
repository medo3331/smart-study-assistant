import type { Metadata } from 'next';
import { JsonLd } from '@/components/JsonLd';
import { SeoContentPage } from '@/components/SeoContentPage';
import { breadcrumbLd, pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'تعلم البرمجة',
  description: 'تعلم البرمجة مع Magicly: نظّم موادك، افهم الدروس التقنية، راجع المفاهيم وأنشئ خطة دراسة تساعد المبتدئين على التقدم خطوة بخطوة.',
  path: '/programming',
  keywords: ['تعلم البرمجة', 'تعليم البرمجة', 'تعلم البرمجة بالذكاء الاصطناعي', 'برمجة للمبتدئين'],
});

export default function ProgrammingPage() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: 'الرئيسية', path: '/' }, { name: 'تعلم البرمجة', path: '/programming' }])} />
      <SeoContentPage
        eyebrow="تعلم البرمجة"
        title="تعلم البرمجة بخطة تبدأ من مادتك"
        intro="يوفر Magicly مسار البرمجة والتكنولوجيا للطلاب الذين يريدون تنظيم دروسهم التقنية وفهمها بصورة أفضل. ارفع مذكراتك أو موادك التعليمية واستفد من الشرح والتلخيص والاختبارات أثناء المذاكرة."
        sections={[
          {
            title: 'ماذا يمكنك دراسته في مسار البرمجة؟',
            body: 'هذه أمثلة لموضوعات تظهر ضمن المسارات المقترحة في المنصة، وهي اقتراحات لتنظيم البداية وليست منهجًا أو شهادة مستقلة من Magicly.',
            items: [
              { icon: '⌨️', title: 'أساسيات البرمجة', body: 'راجع المفاهيم الأولى والملاحظات التي تدرسها خطوة بخطوة.' },
              { icon: '🐍', title: 'Python وJavaScript', body: 'نظّم المحاضرات والتمارين الخاصة بهذه المواد عندما تكون ضمن مسارك الدراسي.' },
              { icon: '🌐', title: 'HTML وCSS', body: 'استخدم أدوات الفهم والمراجعة مع الدروس والملفات التي تعمل عليها.' },
              { icon: '🧩', title: 'هياكل البيانات وقواعد البيانات', body: 'قسّم المفاهيم الكبيرة إلى خطة مراجعة وأسئلة تساعدك على تثبيت الفهم.' },
            ],
          },
          {
            title: 'كيف يفيد الذكاء الاصطناعي طالب البرمجة؟',
            body: 'يساعدك Magicly على قراءة المادة التقنية بتركيز: لخّص الدرس، اطلب شرحًا للمفهوم الصعب، ثم اختبر فهمك. هذه مساعدة للمذاكرة وليست بديلًا عن التطبيق العملي أو مراجعة المصادر الأصلية.',
          },
        ]}
        links={[{ href: '/ai-study-assistant', label: 'مساعد دراسة بالذكاء الاصطناعي' }, { href: '/subjects', label: 'كل المواد التعليمية' }, { href: '/study-tools', label: 'أدوات الدراسة' }, { href: '/demo', label: 'ابدأ بموادك' }]}
      />
    </>
  );
}
