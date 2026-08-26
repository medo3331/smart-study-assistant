'use client';

/**
 * 🦶 الفوتر — آخر حاجة في الصفحة.
 *
 * ═══ إزاي تعدّله ═══
 *   • اللينكات (سوشيال + إيميل): `lib/site-links.ts` — مكان واحد بس.
 *   • النصوص كلها: `lib/i18n/dictionaries.ts` تحت `footer_*` في اللغتين.
 *   • ترتيب أيقونات السوشيال: مصفوفة SOCIAL_ORDER تحت.
 *   • أعمدة التنقل: مصفوفة COLUMNS تحت — كل عمود عنوان + لينكات.
 *
 * ═══ القاعدة الأهم: مفيش لينك ميت ═══
 * أي لينك سوشيال فاضي في site-links **مايتعرضش**، ولو كلهم فاضيين الصف
 * كله بيتشال (مش بيسيب مساحة ولا عنوان معلّق). نفس منطق CommunityInvite:
 * أيقونة بتودّي على "#" بتبلّغ الزائر إن الموقع مسيّب.
 *
 * ═══ الهوية: كعب الملزمة ═══
 * الفوتر هو "كعب الدفتر" — الجزء المقوّى اللي الورق كله مربوط فيه.
 * فبيقلب علاقة الهامش: الأقسام كلها فوق ليها خط أحمر على **الجنب**،
 * والفوتر ليه خط أحمر **فوق** بعرض الصفحة كلها (`.footer-rule`) —
 * بيقرا كخط النهاية في الكشكول. والخلفية `--paper-3` (أغمق درجة من
 * الصفحة) عشان يحس إنه طبقة تحتية مش قسم زيادة.
 *
 * ⚠️ ميزانية اللون: مفيش ضربة `.mark` هنا خالص، ودي القاعدة اللي بتحكم
 * الشعار. العلامة بتاخد `--hl-yellow-ink` (نسخة الأكسنت المقروية كمقدّمة)
 * والاسم بالحبر — فالفوتر بيفضل هادي، والضربة الوحيدة في الشاشة بتروح
 * للهيرو.
 *
 * ⚠️ الحركة: كل الهوفر في الـ CSS بـ transition مش بـ Framer. السبب إن
 * الفوتر فيه ٢٠+ لينك، ولو كل واحد بقى motion component يبقى ٢٠ مستمع
 * حركة على عنصر الزائر بيمر عليه مرة واحدة في آخر الصفحة.
 */

import Link from 'next/link';
import { Mail, MessageCircle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { BrandGlyph } from '@/components/BrandLogo';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import {
  SITE_LINKS,
  contactHref,
  contactChannel,
  contactIsExternal,
  type SocialId,
} from '@/lib/site-links';
import { SOCIAL_MARKS } from './social-marks';

/* ترتيب العرض. اللي مش متظبط لينكه في site-links بيتشال أوتوماتيك،
   فالترتيب ده هو ترتيب "لو كلهم موجودين". */
const SOCIAL_ORDER: SocialId[] = [
  'facebook',
  'instagram',
  'x',
  'youtube',
  'tiktok',
  'linkedin',
  'github',
  'telegram',
  'whatsapp',
  'discord',
];

type FooterLink = {
  labelKey: keyof Dictionary;
  href: string;
};

type FooterColumn = {
  titleKey: keyof Dictionary;
  links: FooterLink[];
};

/* الأعمدة.
   ⚠️ أي لينك بيبدأ بـ # لازم يكون الـ id بتاعه موجود فعلاً على اللاندينج.
   الموجود دلوقتي على اللاندينج بعد الترشيق: #how بس (app/page.tsx).
   الميزات والأسئلة بقت **صفحات مستقلة** (/features، /faq) من محور-وأذرع
   نوفمبر ٢٠٢٦ — فبنودّي على الصفحات نفسها. صفحة /reviews اتشالت مع
   الآراء الوهمية، ومرساة #start (PersonaPicker) بقت في الـwizard —
   فـ«ابدأ» بتودّي على مسار التسجيل←الخطة زي باقي أزرار البداية. */
const COLUMNS: FooterColumn[] = [
  {
    titleKey: 'footer_col_product',
    links: [
      { labelKey: 'footer_link_features', href: '/features' },
      { labelKey: 'footer_link_how', href: '/#how' },
      { labelKey: 'footer_link_faq', href: '/faq' },
    ],
  },
  {
    titleKey: 'footer_col_learn',
    links: [
      { labelKey: 'footer_link_start', href: '/login?next=/assessment' },
      { labelKey: 'footer_link_courses', href: '/dashboard/courses' },
      { labelKey: 'footer_link_community', href: '/community' },
    ],
  },
  {
    titleKey: 'footer_col_account',
    links: [
      { labelKey: 'footer_link_dashboard', href: '/dashboard' },
      { labelKey: 'footer_link_login', href: '/login' },
    ],
  },
];

export function SiteFooter() {
  const { t } = useLanguage();

  /* اللي عنده لينك بس. لو المصفوفة طلعت فاضية الصف كله مايتعرضش. */
  const socials = SOCIAL_ORDER.filter((id) => SITE_LINKS[id]).map((id) => ({
    id,
    url: SITE_LINKS[id],
    ...SOCIAL_MARKS[id],
  }));

  /* السنة بتتحسب وقت الرندر. الفوتر مكوّن عميل فالقيمة بتيجي من
     المتصفح — يعني مابتبقى محفورة في البيلد وتقدم مع بداية السنة. */
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      {/* خط النهاية الأحمر: بعرض الصفحة، بيفصل الفوتر عن آخر قسم.
          زخرفة بحتة فمخفي عن قارئ الشاشة — عنصر <footer> نفسه هو اللي
          بيبلّغ إن دي نهاية الصفحة. */}
      <div className="footer-rule" aria-hidden="true" />

      <div className="page">
        <div className="footer-top">
          {/* ─── العمود الأول: الشعار والوصف والسوشيال ─── */}
          <div className="footer-brand-col">
            <Link href="/" className="footer-brand">
              {/* الفوتر بياخد العلامة والاسم بس — السطر الوصفي القصير
                  مالوش لازمة هنا، `footer_tagline` تحته بيقول نفس الحاجة
                  بجملة كاملة. */}
              <BrandGlyph className="footer-brand-glyph" />
              <span>{t.brand}</span>
            </Link>

            <p className="footer-tagline">{t.footer_tagline}</p>

            {socials.length > 0 && (
              <>
                <p className="footer-social-title mono">{t.footer_social_label}</p>
                <ul className="footer-social">
                  {socials.map(({ id, url, label, path }) => (
                    <li key={id}>
                      <a
                        className="footer-social-link"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        /* الاسم بييجي من aria-label لأن جوّه SVG بس —
                           والـ title بيدّي tooltip للماوس. */
                        aria-label={label}
                        title={label}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="17"
                          height="17"
                          fill="currentColor"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path d={path} />
                        </svg>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* ─── أعمدة التنقل ───
              nav واحد حوالين التلات أعمدة مش nav لكل عمود: قارئ الشاشة
              بيعدّ مناطق التنقل، وتلاتة في الفوتر ملهم لازمة. */}
          <nav className="footer-nav" aria-label={t.footer_nav_label}>
            {COLUMNS.map(({ titleKey, links }) => (
              <div key={titleKey} className="footer-col">
                {/* ⚠️ عنوان العمود مكتوب <p> مش <h2> عن قصد.
                    الفوتر بيتكرر في كل صفحة، ولو أعمدته بقت h2 يبقى
                    مخطط أي صفحة فيه أربع عناوين مستوى تاني («المنتج»،
                    «تتعلّم»…) بتزاحم عناوين المحتوى الحقيقي — والزائر
                    اللي بيتنقل بقايمة العناوين بيلاقي نص القايمة فوتر.
                    التنقل هنا بيتبلّغ بـ <nav> و aria-label، وده الدور
                    الصح للمجموعة دي. */}
                <p className="footer-col-title">{t[titleKey]}</p>
                <ul className="footer-links">
                  {links.map(({ labelKey, href }) => (
                    <li key={labelKey}>
                      <Link className="footer-link" href={href}>
                        {t[labelKey]}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* عمود التواصل: جوه الـ nav لأنه نفس النوع من اللينكات،
                بس بأيقونة عشان يبان إنه مختلف. */}
            <div className="footer-col">
              <p className="footer-col-title">{t.footer_contact_title}</p>
              <ul className="footer-links">
                <li>
                  <a
                    className="footer-link footer-link-icon"
                    href={contactHref}
                    {...(contactIsExternal
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                  >
                    {/* الأيقونة بتتغيّر مع القناة عشان ما تكدبش على الزائر:
                        ظرف للإيميل، وفقاعة رسالة للواتساب/المجتمع. */}
                    {contactChannel === 'email' ? (
                      <Mail size={15} strokeWidth={1.7} aria-hidden="true" />
                    ) : (
                      <MessageCircle size={15} strokeWidth={1.7} aria-hidden="true" />
                    )}
                    {/* الإيميل بيتعرض بعنوانه، والواتساب بكلمة واضحة
                        (لأن لينك wa.me نفسه مش نص مقروء)، والمجتمع بنداء. */}
                    <span>
                      {contactChannel === 'email'
                        ? SITE_LINKS.email
                        : contactChannel === 'whatsapp'
                          ? t.footer_whatsapp_label
                          : t.footer_email_label}
                    </span>
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        {/* ─── الشريط السفلي: الحقوق والقانوني ─── */}
        <div className="footer-bottom">
          <p className="footer-copy">
            {/* الرقم معزول بـ .ltr-num: «© 2026» جوه جملة عربي المتصفح
                بيقلبه فيطلع «2026 ©» — نفس درس الأرقام في الداشبورد. */}
            <span className="ltr-num">© {year}</span>{' '}
            {/* الاسم لوحده — من غير السطر الوصفي. لما البراند كان مقسوم
                لكلمتين (`brand` + `brand_mark`) كان لازم يتلمّوا هنا عشان
                يطلعوا اسم كامل؛ دلوقتي `brand` هو الاسم كله، وزوّق
                «للمذاكرة بسحر» جوه سطر الحقوق كان هيبقى «ماجيكلي للمذاكرة
                بسحر — كل الحقوق محفوظة». */}
            <span className="footer-copy-name">{t.brand}</span>{' '}
            — {t.footer_rights}
          </p>

          <ul className="footer-legal">
            <li>
              <Link className="footer-legal-link" href="/privacy">
                {t.footer_privacy}
              </Link>
            </li>
            <li>
              <Link className="footer-legal-link" href="/terms">
                {t.footer_terms}
              </Link>
            </li>
            {/* سطر المنشأ: آخر حاجة في الترتيب وأهدى حاجة في اللون —
                توقيع مش لينك، فمكتوب span مش anchor. */}
            <li>
              <span className="footer-made">{t.footer_made_with}</span>
              <span className="footer-developed">{t.footer_developed_by}</span>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
