import type { MetadataRoute } from 'next';
import { SITE_NAME, SITE_TITLE, SITE_DESC } from '@/lib/seo';

/* ملف الـ PWA. Next بيحوّله لـ /manifest.webmanifest أوتوماتيك،
   والـ layout بيلينكه في الميتاداتا.

   الاسم والوصف بيتقروا من `lib/seo.ts` مش مكتوبين هنا: شاشة التثبيت
   واسم الأيقونة على الشاشة الرئيسية لازم يطابقوا عنوان الموقع، ولو
   اتكتبوا مرتين واحدة منهم بتُنسى مع أول تغيير في البراند.

   ملاحظتين مهمين:
   1) start_url = /dashboard عشان يطابق sw.js — الإشعار لما يتفتح بيروح
      على data.url أو /dashboard، فلو التطبيق مثبّت يفتح على نفس المكان.
   2) مش بنحط screenshots هنا: الصور اللي في public/screenshots مقاساتها
      متفاوتة (٤٧٥×٥٠٨ لحد ١٢٣٤×٥٠٦) ومش صالحة لشاشة التثبيت. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_TITLE,
    short_name: SITE_NAME,
    description: SITE_DESC,
    lang: 'ar',
    dir: 'rtl',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#101524',
    theme_color: '#101524',
    categories: ['education', 'productivity'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      /* ⚠️ الـ maskable ملف **تاني** مش نفس icon-512 اللي فوق، وده مقصود:
         أندروايد بيقص الأيقونة الـ maskable بشكل الجهاز (دايرة، معيّن،
         مربّع مدوّر) والمضمون منها دايرة قطرها ٨٠٪ بس. icon-512 أصلاً
         مربّع مدوّر بزوايا شفافة، فلو اتعلّم maskable التدوير بيتضاعف
         والزوايا الشفافة بتطلع سودة. النسخة دي مربّع كامل من غير شفافية
         والعلامة جوّاها أصغر عشان تفضل داخل الدايرة المضمونة. */
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
