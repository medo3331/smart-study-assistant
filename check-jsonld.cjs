/* فحص مؤقت للبيانات المنظّمة — بيشغّل الدوال الحقيقية من lib/seo.ts
   عن طريق jiti (بيفك الـ TS و الـ @/ alias من غير بيلد).
   `next build` مكسور في الـ VM ده فده البديل الوحيد للتأكد إن الـ
   JSON-LD بيتولّد فعلاً وبشكل صحيح مش بس إنه بيعدّي من tsc. */
const { createJiti } = require('jiti');
const path = require('path');

const ROOT = __dirname;
const jiti = createJiti(__filename, {
  alias: { '@': ROOT },
  interopDefault: true,
});

process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

const seo = jiti(path.join(ROOT, 'lib/seo.ts'));

const graphs = {
  organization: seo.organizationLd(),
  website: seo.webSiteLd(),
  app: seo.softwareApplicationLd(),
  faq: seo.faqPageLd(),
  breadcrumb: seo.breadcrumbLd([
    { name: 'الرئيسية', path: '/' },
    { name: 'جرّب من غير حساب', path: '/demo' },
  ]),
};

let fail = 0;
const bad = (msg) => {
  fail++;
  console.log('❌ ' + msg);
};

for (const [name, g] of Object.entries(graphs)) {
  // كل جراف لازم يبقى JSON صالح وليه @context و @type
  let round;
  try {
    round = JSON.parse(JSON.stringify(g));
  } catch (e) {
    bad(`${name}: مش JSON صالح — ${e.message}`);
    continue;
  }
  if (round['@context'] !== 'https://schema.org') bad(`${name}: @context ناقص`);
  if (!round['@type']) bad(`${name}: @type ناقص`);

  // مفيش undefined جوّه (بيختفي بصمت في JSON.stringify)
  const walk = (o, p) => {
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (v === undefined) bad(`${name}: ${p}.${k} = undefined`);
        else if (v === '') bad(`${name}: ${p}.${k} = نص فاضي`);
        else walk(v, `${p}.${k}`);
      }
    }
  };
  walk(g, name);
}

// الأسئلة لازم تطابق الأكورديون بالظبط
const faqSrc = jiti(path.join(ROOT, 'lib/faq.ts')).FAQS;
const dict = jiti(path.join(ROOT, 'lib/i18n/dictionaries.ts')).dictionaries;
if (graphs.faq.mainEntity.length !== faqSrc.length)
  bad(`عدد أسئلة الـ JSON-LD (${graphs.faq.mainEntity.length}) مش = المصدر (${faqSrc.length})`);

faqSrc.forEach((f, i) => {
  const q = graphs.faq.mainEntity[i];
  if (q.name !== dict.ar[f.qKey]) bad(`سؤال ${f.id}: النص مش مطابق للقاموس`);
  if (q.acceptedAnswer.text !== dict.ar[f.aKey]) bad(`إجابة ${f.id}: النص مش مطابق للقاموس`);
  if (!dict.en[f.qKey] || !dict.en[f.aKey]) bad(`سؤال ${f.id}: ناقص في القاموس الإنجليزي`);
});

// اللينكات المطلقة لازم تبقى على الدومين المظبوط
const urls = JSON.stringify(graphs).match(/https?:\/\/[^"]+/g) || [];
const localhost = urls.filter((u) => u.includes('localhost'));
if (localhost.length) bad(`لينكات localhost في المخرجات: ${localhost.join(', ')}`);

console.log('\n=== عيّنة: FAQ أول سؤال ===');
console.log(JSON.stringify(graphs.faq.mainEntity[0], null, 2).slice(0, 400));
console.log('\n=== عدد الأسئلة:', graphs.faq.mainEntity.length, '===');
console.log('=== sameAs:', JSON.stringify(graphs.organization.sameAs), '===');
console.log('=== breadcrumb:', JSON.stringify(graphs.breadcrumb.itemListElement), '===');
console.log('\n' + (fail ? `❌ ${fail} مشكلة` : '✅ كل الفحوص عدّت'));
