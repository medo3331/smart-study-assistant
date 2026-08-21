/* فحص الميتاداتا — بينادي pageMeta() مباشرة بدل ما يحاول يحمّل اللايوتس
   اللي فيها CSS وخطوط. كل صفحة بتنادي pageMeta()، فاختبارها هو
   اختبار لنتيجة كل صفحة. */
const { createJiti } = require('jiti');
const path = require('path');

const ROOT = __dirname;
const jiti = createJiti(__filename, { alias: { '@': ROOT }, interopDefault: true });
process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

let fail = 0;
const bad = (m) => { fail++; console.log('❌ ' + m); };

const seo = jiti(path.join(ROOT, 'lib/seo.ts'));

/* الثوابت الخاصة بالرئيسية لا تمرّ عبر pageMeta() لأنها موروثة من
   app/layout.tsx، لذلك نتحقق منها هنا مباشرة. */
if (seo.SITE_URL !== 'https://magiclly.com') bad(`الدومين القانوني غير صحيح: ${seo.SITE_URL}`);
if (seo.SITE_TITLE !== 'Magicly | منصة تعليمية ذكية ومساعد دراسة بالذكاء الاصطناعي')
  bad(`عنوان الصفحة الرئيسية غير صحيح: ${seo.SITE_TITLE}`);
if (seo.SITE_DESC.length > 160) bad(`وصف الصفحة الرئيسية ${seo.SITE_DESC.length} حرف (>160)`);
for (const keyword of ['منصة تعليمية', 'مساعد دراسة', 'الذكاء الاصطناعي', 'مواد تعليمية', 'الطلاب']) {
  if (!seo.SITE_DESC.includes(keyword)) bad(`وصف الصفحة الرئيسية لا يحتوي «${keyword}»`);
}

/* نفس النداءات اللي بتعملها كل صفحة.

   ⚠️ صفّ `home` تقريبي: الصفحة الرئيسية الحقيقية مابتنادي `pageMeta()`
   خالص — عنوانها جاي من `title.default` في `app/layout.tsx`. الصف موجود
   هنا عشان يفحص ثوابت `pageMeta` على مسار `/` (الكانونيكال والروبوتس و
   OG)، فبيتغذّى بالسطر الوصفي مش بالعنوان الكامل — لو اتغذّى بـ
   `SITE_TITLE` كان `pageMeta` هيزوّد « · ماجيكلي» على عنوان فيه الاسم
   أصلاً ويطلع الاسم مكرّر. */
const pages = [
  { name: 'home', title: seo.SITE_TAGLINE, desc: seo.SITE_DESC, path: '/', expectIndex: true },
  { name: 'demo', title: 'جرّب من غير حساب', desc: 'ارفع ملزمتك وشوف الذكاء', path: '/demo', expectIndex: true },
  { name: 'community', title: 'اسأل زمايلك', desc: 'اسأل سؤالك في مادتك', path: '/community', expectIndex: true },
  { name: 'subjects', title: 'المواد التعليمية', desc: 'استكشف المواد التعليمية', path: '/subjects', expectIndex: true },
  { name: 'ai-assistant', title: 'مساعد دراسة بالذكاء الاصطناعي', desc: 'استخدم Magicly كمساعد دراسة', path: '/ai-study-assistant', expectIndex: true },
  { name: 'programming', title: 'تعلم البرمجة', desc: 'تعلم البرمجة مع Magicly', path: '/programming', expectIndex: true },
  { name: 'study-tools', title: 'أدوات الدراسة والتعلم', desc: 'اكتشف أدوات الدراسة', path: '/study-tools', expectIndex: true },
  { name: 'login', title: 'تسجيل الدخول', desc: 'ادخل على حسابك', path: '/login', expectIndex: false },
  { name: 'assessment', title: 'حدّد مجالك وهدفك', desc: 'كام سؤال سريع', path: '/assessment', expectIndex: false },
  { name: 'dashboard', title: 'مساحتك', desc: 'خطتك وتقدّمك وملفاتك', path: '/dashboard', expectIndex: false },
  { name: 'privacy', title: 'سياسة الخصوصية', desc: 'إيه البيانات اللي بنحفظها', path: '/privacy', expectIndex: false },
  { name: 'terms', title: 'شروط الاستخدام', desc: 'الاتفاق بينك وبين', path: '/terms', expectIndex: false },
];

const seenCanonical = new Map();

for (const { name, title, desc, path, expectIndex } of pages) {
  const m = seo.pageMeta({ title, description: desc, path, noIndex: !expectIndex,
    ogType: (path === '/privacy' || path === '/terms') ? 'article' : 'website' });

  // كانونيكال
  const c = m.alternates?.canonical;
  if (!c) bad(`${name}: مفيش كانونيكال`);
  else if (c !== path) bad(`${name}: كانونيكال "${c}" متوقع "${path}"`);
  else if (seenCanonical.has(c)) bad(`${name}: كانونيكال مكرر مع ${seenCanonical.get(c)}`);
  else seenCanonical.set(c, name);

  // index/noindex
  if (expectIndex && m.robots?.index !== true) bad(`${name}: متوقع index، لقى ${JSON.stringify(m.robots)}`);
  if (!expectIndex && m.robots?.index !== false) bad(`${name}: متوقع noindex، لقى ${JSON.stringify(m.robots)}`);

  // وصف مش طويل قوي
  if (!m.description) bad(`${name}: مفيش وصف`);
  else if (m.description.length > 165) bad(`${name}: الوصف ${m.description.length} حرف (>165)`);
  else if (!m.description.includes(desc.slice(0, 10))) bad(`${name}: الوصف مش بيحتوي المتوقع`);

  // OG
  if (!m.openGraph?.images?.length) bad(`${name}: مفيش صورة OG`);
  if (!m.openGraph?.title) bad(`${name}: مفيش عنوان OG`);

  // تويتر
  if (!m.twitter?.card) bad(`${name}: مفيش تويتر كارد`);
  if (!m.twitter?.images?.length) bad(`${name}: مفيش صورة تويتر`);

  // كلمات مفتاحية
  if (!m.keywords?.length) bad(`${name}: مفيش كلمات مفتاحية`);

  // الكانونيكال للـ OG تويتر بيستخدموا لينك مطلق (من metadataBase)
  // pageMeta بيستخدم نسبي — ده الصح، metadataBase بيحوله

  const idx = expectIndex ? 'index  ' : 'noindex';
  console.log(`  ${idx}  ${name.padEnd(12).slice(0,12)} can=${String(c).padEnd(15)} desc=${m.description.length}  og="${m.openGraph?.title?.slice(0,30)}" tw="${m.twitter?.card}"`);
}

// العناوين الديناميكية للدرس
console.log('\n=== DYNAMIC (lesson) ===');
for (const dayId of ['3', '12', '9999', '../etc/passwd', '<script>x']) {
  const m = seo.pageMeta({
    title: /^\d{1,4}$/.test(dayId) ? `اليوم ${dayId}` : 'الدرس',
    description: 'الشرح والتمارين بتاعة اليوم ده من خطة مذاكرتك.',
    path: `/lesson/${dayId}`,
    noIndex: true,
  });
  const t = String(m.title);
  if (m.robots?.index !== false) bad(`lesson ${dayId}: المفروض noindex`);
  if (/[<>]/.test(t)) bad(`lesson ${dayId}: نص خطير في العنوان — "${t}"`);
  if (dayId.includes('/') && t.includes(dayId)) bad(`lesson: dayId حميدة في العنوان — "${t}"`);
  console.log(`  dayId=${JSON.stringify(dayId).padEnd(20)} title=${t.padEnd(25)} canonical=${m.alternates?.canonical}`);
}

console.log('\n' + (fail ? `❌ ${fail} مشكلة` : '✅ كل فحوص الميتاداتا عدّت'));
