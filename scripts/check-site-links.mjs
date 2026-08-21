/**
 * 🔎 فحص لينكات الموقع — بيتأكد إن كل قيمة في lib/site-links.ts لينك سليم
 * قبل النشر. اتكتب بعد ما لينكين غلط اتسرّبوا فعلاً (إيميل بـ @ زيادة كان
 * بيعمل mailto:@…، ورقم واتساب بصيغة محلية) — النوع ده من الغلط صامت:
 * الأيقونة بتظهر عادي، بس بتودّي على محادثة غلط أو صفحة مكسورة.
 *
 * التشغيل:  npm run check:links       (أو: node scripts/check-site-links.mjs)
 * بيرجّع كود خروج ≠ 0 لو فيه خطأ صريح — فينفع يتحط في CI أو قبل الكوميت.
 *
 * ⚠️ بيعمل import مباشر لـ site-links.ts (مش regex زي shop-seed.mjs): الملف
 * ده **ملوش أي استيراد** — بيقرا process.env ويصدّر بس — فتشغيله في Node
 * بيشتغل من غير مشاكل الاستيراد بلا امتداد اللي في باقي الملفات. المقابل
 * إنه محتاج Node ≥ 22.6 (بيقرا .ts مباشرة بتقشير الأنواع). أداة تطوير بس،
 * مش جزء من الـ build.
 */

import { SITE_LINKS, contactHref, contactChannel } from '../lib/site-links.ts';

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/* كل مفاتيح السوشيال (كل حاجة في SITE_LINKS ماعدا الإيميل). */
const SOCIAL_KEYS = [
  'facebook',
  'instagram',
  'tiktok',
  'telegram',
  'whatsapp',
  'discord',
  'x',
  'youtube',
  'linkedin',
  'github',
];

/* باراميترات تتبّع معروفة بتتحقن وقت المشاركة وملهاش لازمة عشان الصفحة
   تفتح — وجودها بيخلّي كل زائر يمشي بنفس توكن جلسة المشاركة الأصلية. */
const TRACKING_PARAMS = ['igsh', '_r', '_t', 'fbclid', 'si', 'utm_source', 'utm_medium', 'utm_campaign'];

/* ─── الإيميل ─── */
const email = SITE_LINKS.email;
if (!email) {
  warn('email فاضي — لينك التواصل هيرجع على /community (لو مفيش واتساب كمان).');
} else {
  if (email.startsWith('@')) fail(`email بيبدأ بـ @ (${email}) — بيعمل mailto:@… مكسور.`);
  if (email.includes('mailto:')) fail(`email فيه mailto: جوّه (${email}) — القيمة لازم تكون العنوان بس.`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`email مش بصيغة صحيحة: ${email}`);
}

/* ─── لينكات السوشيال ─── */
for (const key of SOCIAL_KEYS) {
  const value = SITE_LINKS[key];
  if (!value) continue; // فاضي عن قصد = الأيقونة مش بتتعرض أصلاً

  if (value.startsWith('@')) {
    fail(`${key} بيبدأ بـ @ (${value}) — لازم لينك كامل مش معرّف.`);
    continue;
  }
  if (/\s/.test(value)) fail(`${key} فيه مسافة (${value}).`);

  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${key} مش URL صالح: ${value}`);
    continue;
  }
  if (url.protocol !== 'https:') fail(`${key} مش https: ${value}`);

  for (const param of TRACKING_PARAMS) {
    if (url.searchParams.has(param)) warn(`${key} فيه باراميتر تتبّع «${param}» — يفضل يتشال: ${value}`);
  }
}

/* ─── واتساب: رقم دولي أرقام بس على wa.me ─── */
const wa = SITE_LINKS.whatsapp;
if (wa) {
  try {
    const url = new URL(wa);
    if (url.hostname !== 'wa.me') {
      warn(`whatsapp مش على wa.me (${url.hostname}) — الصيغة الرسمية wa.me/<رقم>.`);
    }
    const number = url.pathname.replace(/\//g, '');
    if (!/^\d+$/.test(number)) {
      fail(`whatsapp لازم يكون أرقام بس من غير + ولا مسافات: ${wa}`);
    } else {
      if (number.startsWith('0')) {
        fail(`whatsapp بصيغة محلية (بيبدأ بصفر): ${number} — لازم دولي (مصر: 20…).`);
      }
      if (number.length < 10 || number.length > 15) {
        warn(`whatsapp طول الرقم (${number.length} خانة) غير معتاد: ${number} — راجعه.`);
      }
    }
  } catch {
    /* الغلط في صيغة الـ URL نفسها اتمسك في حلقة السوشيال فوق. */
  }
}

/* ─── تليجرام: t.me/<username> من غير @ ─── */
const tg = SITE_LINKS.telegram;
if (tg) {
  try {
    const url = new URL(tg);
    if (url.hostname !== 't.me') warn(`telegram مش على t.me (${url.hostname}).`);
    const username = url.pathname.replace(/\//g, '');
    if (username.startsWith('@')) fail(`telegram المعرّف فيه @ (${username}) — t.me/<username> من غير @.`);
    if (!username) warn('telegram من غير معرّف بعد t.me/.');
  } catch {
    /* اتمسك فوق. */
  }
}

/* ─── لينك التواصل الناتج (اللي الفوتر والأسئلة بيقروا منه) ─── */
if (!/^(https:\/\/|mailto:|\/)/.test(contactHref)) {
  fail(`contactHref مش بادئ بـ https:// أو mailto: أو / : ${contactHref}`);
}

/* ─── التقرير ─── */
console.log(`قناة التواصل الحالية: ${contactChannel}`);
console.log(`لينك التواصل: ${contactHref}\n`);

if (warnings.length) {
  console.log(`⚠️  تحذيرات (${warnings.length}):`);
  for (const w of warnings) console.log('   - ' + w);
  console.log('');
}

if (errors.length) {
  console.log(`❌ أخطاء (${errors.length}):`);
  for (const e of errors) console.log('   - ' + e);
  console.log('\nفيه لينكات مكسورة — صلّحها في lib/site-links.ts قبل النشر.');
  process.exit(1);
}

console.log('✅ كل اللينكات سليمة.');
