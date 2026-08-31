import type { Metadata, Viewport } from 'next';
import { Alexandria, IBM_Plex_Sans_Arabic, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ThemeProvider } from '../theme/ThemeProvider';
import { LanguageProvider } from '../lib/i18n/LanguageProvider';
import { AudioProvider } from '@/components/audio/AudioProvider';
import { QuranAudioProvider } from '@/hooks/useQuranAudio';
import { SupportWidget } from '@/components/SupportWidget';
import { FloatingAssistant } from '@/components/FloatingAssistant';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { JsonLd } from '@/components/JsonLd';
import {
  SITE_URL,
  SITE_NAME,
  SITE_TITLE,
  SITE_DESC,
  OG_LOCALE,
  OG_ALTERNATE_LOCALES,
  OG_IMAGE_PATH,
  OG_IMAGE_ALT,
  BASE_KEYWORDS,
  FIELD_KEYWORDS,
  organizationLd,
  webSiteLd,
} from '@/lib/seo';
import './globals.css';

/* العناوين: خط عربي هندسي، متغيّر الأوزان */
const display = Alexandria({
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-display-src',
});

/* المتن: خط إنساني يعمل تضادًا مع العنوان الهندسي */
const body = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body-src',
});

/* الأرقام وأسماء الملفات واللافتات */
const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono-src',
});

/* الدومين واسم الموقع والوصف كلهم من `lib/seo.ts` — المصدر الوحيد.
   أي صفحة جديدة بتنادي `pageMeta()` من هناك بدل ما تكتب الميتاداتا بإيدها.
   ⚠️ لو `NEXT_PUBLIC_SITE_URL` مش متظبط في الإنتاج، صور الـ OG
   والكانونيكال هيتحوّلوا لدومين الـ deployment بتاع Vercel بدل الدومين
   الحقيقي — شوف التعليق في أول `lib/seo.ts`. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    /* أي صفحة بتحدد title بيبقى "العنوان · ماجيكلي" */
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  keywords: [...BASE_KEYWORDS, ...FIELD_KEYWORDS],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  manifest: '/manifest.webmanifest',
  category: 'education',

  /* الأيقونات على مصدرين، والتقسيمة مقصودة:

     ١) `app/icon.svg` و `app/favicon.ico` = اتفاقية ملفات. Next بيكتشفهم
        لوحده وبيحطّهم **قبل** اللي مكتوب تحت (بيعمل merge وبيقدّمهم)،
        وبيزوّد هاش على اللينك فالكاش بيتفضّى لوحده لو اللوجو اتغيّر.
        عشان كده مش مكتوبين هنا — كتابتهم كانت هتطلّع لينك مكرّر من غير هاش.
     ٢) اللي تحت في `public/` فمحتاج تصريح صريح.

     ⚠️ apple-icon مربّع كامل من غير شفافية عن قصد: iOS بيحطّ القناع
     المدوّر بنفسه، والشفافية عنده بتتحول أسود. باقي الأيقونات مدوّرة
     بشفافية عشان تفضل مربّع مدوّر على أي خلفية نظام. */
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },

  openGraph: {
    type: 'website',
    locale: OG_LOCALE,
    alternateLocale: OG_ALTERNATE_LOCALES,
    url: '/',
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESC,
    /* الصورة نفسها في public/opengraph-image.png (١٢٠٠×٦٣٠).
       سايبينها هنا كمرجع صريح عشان لو اتغير المكان يبان بسرعة. */
    images: [
      {
        url: OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: OG_IMAGE_ALT,
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESC,
    images: [OG_IMAGE_PATH],
  },

  /* التطبيق لما يتثبّت على iOS: شريط الحالة غامق زي الباليتة */
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'black-translucent',
  },

  /* كانونيكال الصفحة الرئيسية. كل صفحة تانية بتحدد بتاعها عن طريق
     `pageMeta()` — من غير كده كل الصفحات هتورّث `/` وتبقى مكرّرة. */
  alternates: {
    canonical: '/',
  },

  robots: {
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

  formatDetection: { telephone: false, address: false, email: false },
};

/* لون شريط المتصفح. قيمتين عشان كل ثيم — الغامق هو الافتراضي في المشروع.
   لازم يطابقوا --paper في globals.css. */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#101524' },
    { media: '(prefers-color-scheme: light)', color: '#E4EAF4' },
  ],
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
};

/* بيتنفّذ قبل أول رسم للصفحة عشان يمنع فلاشة الثيم الغلط.
   من غيره الـ HTML بيتبعت من غير data-theme، فالباليت الفاتحة (الافتراضية)
   بترسم الأول وبعدين الـ useEffect بيقلبها لغامق — يعني ومضة بيضا كل تحميل.
   الاتنين لازم يفضلوا متطابقين مع منطق ThemeProvider.

   وبيحطّ كمان باليتة المتجر (data-pack) من نفس السبب بالظبط: الباليتة
   الملبوسة بتيجي من Supabase، فمن غير السطرين دول المستخدم بيشوف الورق
   الأصلي ثم ثيمه — ومضة أوضح من ومضة الفاتح/الغامق لأن الباليتة بتغيّر
   الطقم كله. المصدر الحقيقي يفضل shop_equipped؛ ده كاش عرض بس.
   (شوف PACK_KEY في lib/shop/shop-data.ts — الاسم لازم يتطابق.) */
const noFlashTheme = `
(function(){try{
  var VALID=['indigo-light','warm-dark','slate','deep-green'];
  var LEGACY={light:'indigo-light',dark:'warm-dark'};
  var s=localStorage.getItem('theme');
  var t=null;
  if(s && VALID.indexOf(s)!==-1) t=s;
  else if(s && LEGACY[s]) { t=LEGACY[s]; try{localStorage.setItem('theme',t);}catch(e){} }
  else if(!s) {
    t=(window.matchMedia('(prefers-color-scheme: light)').matches?'indigo-light':'warm-dark');
    try{localStorage.setItem('theme',t);}catch(e){}
  }
  if(!t || VALID.indexOf(t)===-1) t='warm-dark';
  document.documentElement.setAttribute('data-theme',t);
  var p=localStorage.getItem('shop_pack');
  if(p){document.documentElement.setAttribute('data-pack',p);}
  var l=localStorage.getItem('locale');
  if(l==='en'){document.documentElement.lang='en';document.documentElement.dir='ltr';}
}catch(e){try{document.documentElement.setAttribute('data-theme','warm-dark');}catch(_){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body>
        {/* البيانات المنظّمة على مستوى الموقع: الكيان (EducationalOrganization)
            والموقع (WebSite). الاتنين هنا مش في صفحة معيّنة لأنهم بيوصفوا
            الموقع كله، وباقي الصفحات بتشاور عليهم بـ @id بدل ما تكرّرهم. */}
        <JsonLd data={[organizationLd(), webSiteLd()]} />

        {/* 🔊 الصوت هنا مش في app/dashboard — عنصر الـ <audio> بيفضل
            مركّب طول ما المستخدم جوه التطبيق، فالتنقّل (router.push)
            مابيقطعش الصوت. لو اتحط في أي layout أعمق كان هيفصل أول ما
            تخرج من الفرع بتاعه. المشغّل العائم بيتركّب من جوّه. */}
        <ThemeProvider>
          <LanguageProvider>
            <AudioProvider>
              <QuranAudioProvider>{children}</QuranAudioProvider>
              <SupportWidget />
              <FloatingAssistant />
            </AudioProvider>
          </LanguageProvider>
        </ThemeProvider>

        {/* بيسجّل السيرفس وركر عشان الأوفلاين + استقبال الإشعارات. بيرندر
            null، وبيشتغل في الإنتاج بس (شوف ServiceWorkerRegister). */}
        <ServiceWorkerRegister />

        {/* قياسات Vercel. الاتنين بيرندروا null — مافيش أي حاجة في الشاشة،
            بس سكربت بيتحمّل، فمكانهم آخر الـ body عن قصد.
            بيشتغلوا في الإنتاج على Vercel بس: محلياً بيقفوا لوحدهم من غير
            إعداد، فمافيش لزوم لشرط process.env حواليهم.
            Analytics = زيارات الصفحات، SpeedInsights = مقاييس Core Web Vitals
            الحقيقية من أجهزة المستخدمين. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
