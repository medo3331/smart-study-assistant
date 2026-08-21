/**
 * ⚖️ هيكل الصفحات القانونية — بيستخدمه /privacy و /terms.
 *
 * ═══ إزاي تعدّل ═══
 * المكوّن ده **مافيهوش أي نص قانوني**. النص كله في الصفحتين نفسهم
 * (app/privacy/page.tsx و app/terms/page.tsx) على شكل مصفوفة أقسام:
 *   { id, title, body: ['فقرة', 'فقرة'] }
 * تضيف قسم؟ زوّد عنصر في المصفوفة. تشيل؟ امسح سطره. ترتّب؟ حرّك.
 * الترقيم والفهرس بيتحسبوا من الترتيب أوتوماتيك، فمفيش رقم مكتوب
 * بالإيد ينسى يتحدّث.
 *
 * ═══ ليه سيرفر كومبوننت ═══
 * زي app/not-found.tsx بالظبط: مفيش حالة ولا حركة هنا، فمفيش سبب
 * نحمّل جافاسكريبت على صفحة الزائر بيقراها مرة. المقابل إن
 * useLanguage() مش متاحة، فالنص عربي ثابت.
 *
 * ⚠️ الاتجاه مثبّت: `dir="rtl" lang="ar"` مكتوبين على <article> نفسه.
 * السبب إن LanguageProvider بيقلب dir على <html> لما الزائر يحوّل
 * للإنجليزي — ولو ده حصل والنص عربي، الفقرات هتتصفّ من الشمال
 * والترقيم هيتقلب. تثبيت الاتجاه على العنصر بيخلي المسودّة تقرا صح
 * في اللغتين لحد ما يبقى فيه ترجمة إنجليزي مراجَعة.
 *
 * ⚠️ لافتة المسودّة (`draftNote`) مش زخرفة. الصفحتين دول بيوصفوا سلوك
 * التطبيق الحقيقي بس **ماحدش قانوني راجعهم**. إخفاء ده عن الزائر
 * أسوأ من عدم وجود الصفحة. تشيل اللافتة لما تبقى فيه مراجعة فعلية.
 *
 * ⚠️ ميزانية اللون: ضربة `.mark` واحدة بس — في العنوان. اللافتة الحمرا
 * بتاخد لون القلم الأحمر (`--redpen`) مش الفسفوري، عشان تقرا كملاحظة
 * مدرّس على الهامش مش كـ«إنت هنا».
 */

import Link from 'next/link';
import { ArrowRight, FileWarning } from 'lucide-react';

export type LegalSection = {
  /** بيستخدم كـ id للمرساة وكـ key — لازم يكون فريد في الصفحة */
  id: string;
  title: string;
  /** كل عنصر = فقرة <p> مستقلة */
  body: string[];
};

type LegalDocProps = {
  eyebrow: string;
  /** الجزء الساكن من العنوان */
  title: string;
  /** الجزء اللي بياخد ضربة الفسفوري — ضربة واحدة في الصفحة */
  titleMark: string;
  lede: string;
  /** تاريخ آخر تعديل، مكتوب بالإيد عشان ما يتحدّثش لوحده مع كل بيلد */
  updated: string;
  draftNote: string;
  sections: LegalSection[];
  /** آخر سطر: إزاي الزائر يوصلنا */
  contactLine: string;
  contactHref: string;
  contactLabel: string;
};

export function LegalDoc({
  eyebrow,
  title,
  titleMark,
  lede,
  updated,
  draftNote,
  sections,
  contactLine,
  contactHref,
  contactLabel,
}: LegalDocProps) {
  return (
    <main className="page">
      <article className="band band-top legal" dir="rtl" lang="ar">
        {/* رجوع: أول حاجة في الترتيب لأن الزائر هنا غالباً جاي من
            الفوتر وعايز يرجع لمكانه، مش عايز يبدأ رحلة جديدة. */}
        <Link href="/" className="legal-back">
          <ArrowRight size={15} strokeWidth={1.9} aria-hidden="true" />
          <span>الرجوع للرئيسية</span>
        </Link>

        <p className="eyebrow">{eyebrow}</p>
        <h1 className="h1 legal-title">
          {title} <span className="mark mark-tilt">{titleMark}</span>
        </h1>

        <p className="lede legal-lede">{lede}</p>

        {/* تاريخ آخر تعديل: .ltr-num عشان الرقم ما يتقلبش جوه العربي */}
        <p className="legal-updated mono">
          آخر تعديل: <span className="ltr-num">{updated}</span>
        </p>

        {/* لافتة المسودّة — role="note" عشان قارئ الشاشة يقولها كملاحظة
            جانبية مش كفقرة عادية وسط النص. */}
        <aside className="legal-draft" role="note">
          <FileWarning size={18} strokeWidth={1.8} aria-hidden="true" />
          <p>{draftNote}</p>
        </aside>

        {/* الفهرس: مراسي داخلية. مفيد على الموبايل تحديداً — الصفحة
            دي طويلة والزائر غالباً جاي يدوّر على بند واحد. */}
        <nav className="legal-toc" aria-label="محتويات الصفحة">
          <ol className="legal-toc-list">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a className="legal-toc-link" href={`#${s.id}`}>
                  <span className="legal-toc-num ltr-num mono" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="legal-body">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="legal-section">
              <h2 className="legal-h">
                <span className="legal-h-num ltr-num mono" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{s.title}</span>
              </h2>
              {s.body.map((p) => (
                <p key={p} className="legal-p">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        <p className="legal-contact">
          <span className="muted">{contactLine}</span>{' '}
          <a
            className="legal-contact-link"
            href={contactHref}
            {...(contactHref.startsWith('mailto:') ? {} : { rel: 'noopener' })}
          >
            {contactLabel}
          </a>
        </p>
      </article>
    </main>
  );
}
