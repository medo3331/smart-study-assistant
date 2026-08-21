/* ==========================================================================
   🗺️ خريطة الموقع — بتتولّد على /sitemap.xml

   ═══ القاعدة: الصفحات العامة بس ═══
   السايت ماب معناها «الصفحات دي أنا عايزها في نتايج البحث». فأي حاجة
   محطوط عليها `noIndex` في `pageMeta()` **مالهاش مكان هنا** — سايت ماب
   بتقول «افهرس ده» وميتاداتا بتقول «ماتفهرسش» = إشارة متضاربة، وجوجل
   بيبلّغ عنها في Search Console كـ "Indexed, though blocked".

   يعني مش موجود هنا عن قصد: `/dashboard/*` و`/lesson/*` و`/assessment`
   (محتوى شخصي ورا تسجيل دخول)، و`/login` و`/auth/*` (صفحات إجراء مش
   محتوى)، و`/privacy` و`/terms` (لسه مسودّات ومحطوط عليهم noindex —
   أول ما يتراجعوا يتشالوا من الاستثناء ويتضافوا هنا).

   ⚠️ `lastModified` بتاريخ النهاردة على كل صفحة = كذبة. جوجل بيتعلّم
   يتجاهل السايت ماب اللي بتقول «كل الصفحات اتغيّرت النهاردة» كل يوم.
   فالتواريخ تحت **مكتوبة بالإيد** وبتتحدّث لما المحتوى يتغيّر فعلاً.
   ========================================================================== */

import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/** آخر تعديل حقيقي على محتوى اللاندينج. حدّثها لما تغيّر نص الصفحة.
    ١٢ أغسطس: اللاندينج اتقسمت محور-وأذرع (ملخّصات + صفحات مستقلة). */
const LANDING_UPDATED = new Date('2026-08-12');
const DEMO_UPDATED = new Date('2026-08-07');
const COMMUNITY_UPDATED = new Date('2026-08-07');
/** أول نشر لصفحات الأذرع: /features و /faq. */
const SPOKES_UPDATED = new Date('2026-08-12');
/** صفحات المحتوى التعليمي العامة. */
const SEO_CONTENT_UPDATED = new Date('2026-08-20');

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: LANDING_UPDATED,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      /* الديمو هي تاني أهم صفحة: بتشتغل من غير حساب, فهي نقطة الدخول
         الوحيدة اللي زائر من جوجل يقدر يجرّب فيها المنتج فعلاً. */
      url: `${SITE_URL}/demo`,
      lastModified: DEMO_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      /* أذرع اللاندينج: محتوى كامل اتنقل من ملخّص اللاندينج لصفحته.
         /faq فيها الـ FAQPage JSON-LD، فمهمة تتزحف. */
      url: `${SITE_URL}/features`,
      lastModified: SPOKES_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: SPOKES_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/community`,
      lastModified: COMMUNITY_UPDATED,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/subjects`,
      lastModified: SEO_CONTENT_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/ai-study-assistant`,
      lastModified: SEO_CONTENT_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/programming`,
      lastModified: SEO_CONTENT_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/study-tools`,
      lastModified: SEO_CONTENT_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];
}
