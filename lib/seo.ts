/* ==========================================================================
   🔎 SEO — المصدر الوحيد لكل حاجة بتتقري من محركات البحث والسوشيال.

   ═══ القاعدة ═══
   أي صفحة جديدة **مابتكتبش ميتاداتا بإيدها**. بتنادي `pageMeta()` وخلاص.
   السبب إن الميتاداتا فيها ٦ حاجات لازم تفضل متطابقة مع بعض (العنوان،
   الوصف، OG، تويتر، الكانونيكال، الروبوتس) — ولو كل صفحة كتبتهم بإيدها
   واحدة منهم هتُنسى. الهيلبر بيولّد الستة من مدخلين بس.

   ═══ ليه الدومين من البيئة ═══
   مفيش دومين مكتوب في أي حتة في المشروع. `NEXT_PUBLIC_SITE_URL` هو
   المتغيّر الرسمي، وبعده دومين Vercel، وآخر حاجة localhost.
   ⚠️ لو `NEXT_PUBLIC_SITE_URL` مش متظبط في الإنتاج، **كل** اللينكات
   المطلقة (صور الـ OG، الكانونيكال، السايت ماب) هتطلع بدومين الـ
   deployment العشوائي بتاع Vercel بدل الدومين الحقيقي — يعني كل
   deployment بيبقى نسخة مكرّرة في عين جوجل. حطّه في لوحة Vercel.
   وخد بالك إن `NEXT_PUBLIC_*` بتتقرا **وقت البيلد** فمحتاج redeploy.
   ========================================================================== */

import type { Metadata } from 'next';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { FIELDS } from '@/lib/user-persona';
import { FAQS } from '@/lib/faq';
import { SITE_LINKS } from '@/lib/site-links';

/* ─────────────────────────── الثوابت ─────────────────────────── */

/** الدومين الأساسي من غير سلاش في الآخر (عشان `${SITE_URL}${path}` ما يعملش `//`) */
export const SITE_URL = 'https://magiclly.com';

/* الاسم بشكلين: العربي هو اللي بيتعرض (الجمهور والمحتوى عربي)، واللاتيني
   بيروح `alternateName` في الـ JSON-LD وجوه الكلمات المفتاحية — عشان اللي
   بيدوّر بـ "Magicly" يلاقي نفس الكيان. الاتنين لازم يفضلوا موجودين:
   لو العربي لوحده، البحث اللاتيني مابيوصلش؛ ولو اللاتيني لوحده، عناوين
   نتايج البحث بتطلع مكسورة الاتجاه جوه سطر عربي. */
export const SITE_NAME = 'Magicly';
export const SITE_NAME_AR = 'ماجيكلي';
export const SITE_NAME_EN = 'Magicly';
export const SITE_TAGLINE = 'منصة تعليمية ذكية ومساعد دراسة بالذكاء الاصطناعي';
export const SITE_TITLE = `Magicly | ${SITE_TAGLINE}`;

export const SITE_DESC =
  'Magicly منصة تعليمية ذكية تمنح الطلاب مساعد دراسة بالذكاء الاصطناعي لفهم مواد تعليمية، وتلخيصها، وإنشاء اختبارات وخطط مذاكرة.';

/** لغة المحتوى الأساسية. الموقع بيقلب عربي/إنجليزي من نفس الـ URL. */
export const OG_LOCALE = 'ar_EG';
export const OG_ALTERNATE_LOCALES = ['en_US'];

/** الصورة في `public/opengraph-image.png` — ١٢٠٠×٦٣٠، اتولّدت من أصول
    البراند (نفس العلامة والباليتة بتاعة `app/icon.svg`) */
export const OG_IMAGE_PATH = '/opengraph-image.png';
export const OG_IMAGE_ALT = 'Magicly — منصة تعليمية ذكية ومساعد دراسة بالذكاء الاصطناعي';

/* ─────────────────────────── الكلمات المفتاحية ───────────────────────────

   ⚠️ بصراحة: جوجل **مابيستخدمش** `<meta name="keywords">` في الترتيب من
   ٢٠٠٩. سايبينها لأنها مطلوبة في المواصفة ولأن محركات تانية (Yandex،
   وبعض محركات البحث الداخلية) لسه بتقراها — بس ماتتوقعش منها ترتيب.
   اللي بيرتّب فعلاً هو العنوان والوصف والمحتوى نفسه.
   ─────────────────────────────────────────────────────────────────────── */

/** كلمات المنتج نفسه — بتتحط على كل صفحة */
export const BASE_KEYWORDS = [
  'منصة تعليمية',
  'منصة تعليمية للطلاب',
  'مواد تعليمية',
  'مساعد دراسة',
  'مساعد دراسة بالذكاء الاصطناعي',
  'الدراسة بالذكاء الاصطناعي',
  'التعلم بالذكاء الاصطناعي',
  'AI study assistant',
  'AI learning platform',
  'educational platform',
  'study assistant',
  SITE_NAME,
  SITE_NAME_AR,
  SITE_NAME_EN,
];

/** أسماء المجالات الستة — متقرية من نفس القاموس اللي بيرسمها في الشاشة،
    فلو اتضاف مجال جديد بيدخل الكلمات المفتاحية لوحده من غير ما حد يفتكر. */
export const FIELD_KEYWORDS = FIELDS.map((f) => String(dictionaries.ar[f.labelKey]));

/* ─────────────────────────── هيلبرز ─────────────────────────── */

/** بيحوّل مسار داخلي للينك مطلق. الكانونيكال والسايت ماب والـ JSON-LD
    كلهم محتاجين لينكات مطلقة — النسبي بيتجاهله جوجل في الـ JSON-LD. */
export function absoluteUrl(path = '/'): string {
  if (path.startsWith('http')) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

type PageMetaInput = {
  /** العنوان من غير اسم الموقع — التمبليت في الجذر بيزوّد « · ماجيكلي» */
  title: string;
  description: string;
  /** المسار زي `/login`. ده اللي بيتحوّل لكانونيكال ولـ og:url. */
  path: string;
  /** كلمات زيادة فوق BASE_KEYWORDS */
  keywords?: string[];
  /** صفحات الحساب والمذاكرة: محتوى شخصي مالوش لازمة في البحث */
  noIndex?: boolean;
  /** نوع OG — `website` للصفحات العامة، `article` للقانوني */
  ogType?: 'website' | 'article';
};

/**
 * بيبني ميتاداتا كاملة ومتّسقة لصفحة واحدة.
 *
 * بيولّد: العنوان + الوصف + الكلمات + الكانونيكال + OG (بصورة) +
 * تويتر كارت + الروبوتس. أي صفحة بتنادي ده بتبقى مغطّية بالكامل.
 */
export function pageMeta({
  title,
  description,
  path,
  keywords = [],
  noIndex = false,
  ogType = 'website',
}: PageMetaInput): Metadata {
  /* العنوان الكامل للـ OG وتويتر. التمبليت بتاع Next بيشتغل على
     `<title>` بس — الـ OG محتاج النص كامل بإيدنا، وإلا الشير بيطلع
     «تسجيل الدخول» من غير أي سياق عن الموقع. */
  const fullTitle = `${title} · ${SITE_NAME}`;
  const url = absoluteUrl(path);

  return {
    title,
    description,
    keywords: [...BASE_KEYWORDS, ...keywords],

    /* الكانونيكال بيتكتب نسبي عن قصد: `metadataBase` في الجذر بيحوّله
       لمطلق. كده الدومين مكتوب في مكان واحد بس. */
    alternates: { canonical: path },

    openGraph: {
      type: ogType,
      locale: OG_LOCALE,
      alternateLocale: OG_ALTERNATE_LOCALES,
      url,
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      images: [{ url: OG_IMAGE_PATH, width: 1200, height: 630, alt: OG_IMAGE_ALT }],
    },

    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [OG_IMAGE_PATH],
    },

    robots: noIndex
      ? /* `follow: true` مع `index: false`: مانتشرش الصفحة دي في النتايج
           بس امشي على لينكاتها — عشان اللينكات اللي فيها للصفحات العامة
           تفضل تتزحف عادي. */
        { index: false, follow: true, googleBot: { index: false, follow: true } }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            'max-image-preview': 'large',
            'max-snippet': -1,
            'max-video-preview': -1,
          },
        },
  };
}

/* ─────────────────────────── البيانات المنظّمة (JSON-LD) ───────────────────────────

   ⚠️ قاعدة جوجل الأهم هنا: **البيانات المنظّمة لازم تطابق اللي الزائر
   شايفه في الصفحة.** FAQPage بأسئلة مش ظاهرة = عقوبة يدوية. عشان كده
   الأسئلة تحت متقرية من `lib/faq.ts` — نفس المصدر اللي بيرسم الأكورديون
   في `components/FaqSection.tsx`. مايتكتبوش هنا بالإيد أبداً.
   ─────────────────────────────────────────────────────────────────────── */

/** الحسابات اللي متظبطة فعلاً — `sameAs` بيربط الكيان بحساباته الرسمية.
    الفاضي بيتشال: `sameAs` بلينك فاضي بيكسر التحقق. */
const SOCIAL_PROFILES = [
  SITE_LINKS.facebook,
  SITE_LINKS.instagram,
  SITE_LINKS.tiktok,
  SITE_LINKS.telegram,
  SITE_LINKS.x,
  SITE_LINKS.youtube,
  SITE_LINKS.linkedin,
  SITE_LINKS.github,
].filter(Boolean);

/** المنظّمة — بيتحط في اللايوت الجذر فبيظهر على كل صفحة */
export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: SITE_NAME_EN,
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/icon-512.png'),
      width: 512,
      height: 512,
    },
    image: absoluteUrl(OG_IMAGE_PATH),
    description: SITE_DESC,
    email: SITE_LINKS.email,
    inLanguage: ['ar', 'en'],
    ...(SOCIAL_PROFILES.length ? { sameAs: SOCIAL_PROFILES } : {}),
  };
}

/** الموقع نفسه ككيان. مفيش `SearchAction` عن قصد — مافيش صفحة بحث
    في الموقع، وإعلان بحث مش موجود بيخلي جوجل يزحف على URL بيرجّع ٤٠٤. */
export function webSiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    alternateName: SITE_NAME_EN,
    url: SITE_URL,
    description: SITE_DESC,
    inLanguage: 'ar',
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

/** التطبيق كمنتج. `offers` بسعر صفر لأن الاستخدام مجاني فعلاً
    (شوف faq9: «لازم أدفع؟» — الإجابة لأ، ومن غير بطاقة). */
export function softwareApplicationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${SITE_URL}/#app`,
    name: SITE_NAME,
    alternateName: SITE_NAME_EN,
    url: SITE_URL,
    description: SITE_DESC,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    browserRequirements: 'يحتاج متصفح حديث يدعم JavaScript',
    inLanguage: ['ar', 'en'],
    screenshot: absoluteUrl(OG_IMAGE_PATH),
    publisher: { '@id': `${SITE_URL}/#organization` },
    featureList: [
      'تلخيص المحاضرات والملفات',
      'شرح مبني على ملفك أنت',
      'خطة مذاكرة يوم بيوم',
      'كروت مراجعة وأسئلة امتحان',
      'قراءة الصور والـ PDF',
      'متابعة التقدّم والإنجازات',
    ],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EGP',
      availability: 'https://schema.org/InStock',
    },
  };
}

/** الأسئلة الشائعة — متولّدة من نفس مصدر الأكورديون (`lib/faq.ts`).
    ⚠️ بتتحط على صفحة `/faq` بس — من نوفمبر ٢٠٢٦ اللاندينج بتعرض ملخّص
    (٥ أسئلة) والعشرة كاملين ظاهرين على `/faq`. قاعدة جوجل إن الـ FAQPage
    لازم يطابق النص الظاهر، فالوسم لازم يعيش على الصفحة اللي فيها كل
    الأسئلة — مش على اللاندينج اللي بتوري ٥ بس. الـ `@id` بيشاور على
    `/faq` عشان الكيان يتعرّف بالصفحة الصح. */
export function faqPageLd() {
  const ar = dictionaries.ar;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${SITE_URL}/faq#faq`,
    url: absoluteUrl('/faq'),
    inLanguage: 'ar',
    mainEntity: FAQS.map(({ qKey, aKey }) => ({
      '@type': 'Question',
      name: String(ar[qKey]),
      acceptedAnswer: { '@type': 'Answer', text: String(ar[aKey]) },
    })),
  };
}

/** فتات الخبز — بيخلي جوجل يعرض المسار تحت العنوان في النتايج */
export function breadcrumbLd(trail: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}
