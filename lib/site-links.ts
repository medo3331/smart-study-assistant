/* ==========================================================================
   🔗 لينكات الموقع — الملف ده هو المكان الوحيد اللي بتتغير فيه اللينكات.

   القاعدة المتبعة في المشروع كله (زي CommunityInvite بالظبط):
   **لو اللينك فاضي، العنصر مايتعرضش خالص.** مفيش أيقونة بتودّي على "#"
   ولا زرار ميت — لينك بيودّي على ٤٠٤ أسوأ من إنه مش موجود، لأنه بيبلّغ
   الزائر إن الموقع مسيّب.

   ═══ ليه اللينكات مكتوبة هنا مش في متغيّرات البيئة بس ═══
   لينكات السوشيال **مش أسرار** — أي زائر بيشوفها في الـ HTML. فمتغيّر
   البيئة مابيحميش حاجة هنا، وفي المقابل بيكلّف: ١١ متغيّر لازم يتحطوا
   بالإيد في لوحة Vercel، ولو اتنسي واحد الأيقونة بتغيب في صمت من غير
   أي رسالة. المفاتيح السرّية (OCR، Resend، VAPID) بتفضل في البيئة
   طبعاً — الفرق إن دي أسرار ودي لأ.

   لسه ينفع تعمل override من البيئة (مثلاً حساب مختلف على بيئة تجريبية):
   حطّ المتغيّر وهو بيغلب المكتوب هنا. بس خد بالك إن NEXT_PUBLIC_*
   بتتقرا **وقت البيلد** — يعني لازم redeploy بعد أي تعديل في Vercel.

   ⚠️ الصيغة مهمة: كل قيمة هنا لازم تكون **لينك كامل** يشتغل لو نسخته في
   المتصفح. مش معرّف، مش رقم لوحده، ومن غير @ في الأول. الفوتر بيحطّ
   القيمة زي ما هي في `href` — فأي حاجة مش لينك بتبقى لينك مكسور.
   ========================================================================== */

export const SITE_LINKS = {
  /** الإيميل من غير mailto: ومن غير @ في الأول.
      ⚠️ كان مكتوب '@magicoooo264@gmail.com' — الـ @ الزيادة بتخلّي
      اللينك `mailto:@magicoooo264@gmail.com`، وبرامج الإيميل بتفتح
      بعنوان غلط أو مابتفتحش. اتشالت. */
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || 'magicoooo264@gmail.com',

  /* ─── المتظبط ───
     ⚠️ باراميترات التتبّع (`igsh` في إنستجرام، `_r`/`_t` في تيك توك)
     اتشالت عن قصد. دي توكنات بتتولّد وقت ما تضغط «شير» من التطبيق،
     وملهاش لازمة عشان الصفحة تفتح — وشيلها بيمنع إن كل زائر على الموقع
     يمشي بنفس توكن جلسة المشاركة الأصلية. */
  facebook:
    process.env.NEXT_PUBLIC_FACEBOOK_URL?.trim() || 'https://www.facebook.com/share/19AW1v8Din/',
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL?.trim() || 'https://www.instagram.com/urmagic99',
  tiktok: process.env.NEXT_PUBLIC_TIKTOK_URL?.trim() || 'https://www.tiktok.com/@hookt3000',

  /* «tele med77895» → صيغة اللينك الرسمية للمعرّفات هي t.me/<username> */
  telegram: process.env.NEXT_PUBLIC_TELEGRAM_URL?.trim() || 'https://t.me/med77895',

  /* ⚠️ الرقم اللي اتكتب كان '@01204556797' وده مابيشتغلش لتلات أسباب:
     مش لينك، فيه @ في الأول، والرقم بالصيغة المحلية. لينكات واتساب
     (wa.me) محتاجة **رقم دولي من غير + ولا مسافات ولا صفر في الأول** —
     فالصفر بيتشال ويتحطّ مكانه كود مصر (20): 01204556797 → 201204556797.
     ⚠️ راجع الرقم ده بنفسك قبل النشر — لو غلط الأيقونة بتفتح محادثة
     مع حد تاني خالص. */
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_URL?.trim() || 'https://wa.me/201204556797',

  /* نفس لينك بانر الدعوة — متغيّر واحد عشان ما يتكتبش مرتين */
  discord: process.env.NEXT_PUBLIC_DISCORD_INVITE?.trim() || 'https://discord.gg/znMSZpFzs',

  /* ─── لسه مامتظبطش ───
     أول ما تحطّ لينك، الأيقونة بتظهر لوحدها بالترتيب المكتوب في
     SOCIAL_ORDER في components/SiteFooter. */
  x: process.env.NEXT_PUBLIC_X_URL?.trim() || '',
  youtube: process.env.NEXT_PUBLIC_YOUTUBE_URL?.trim() || '',
  linkedin: process.env.NEXT_PUBLIC_LINKEDIN_URL?.trim() || '',
  github: process.env.NEXT_PUBLIC_GITHUB_URL?.trim() || '',
} as const;

export type SocialId = Exclude<keyof typeof SITE_LINKS, 'email'>;

/* ═══ قناة التواصل ═══
   الزائر اللي عايز يسأل لازم يلاقي طريق في كل الحالات. الأولوية
   **للواتساب** (أسرع رد وأقرب لجمهور المشروع)، وبعده الإيميل، وآخر ملاذ
   صفحة المجتمع — صفحة موجودة فعلاً فمفيش لينك مكسور مهما كانت الحالة.

   المكان الوحيد اللي القناة بتتقرر فيه: كل اللي بيعرض لينك تواصل (الفوتر،
   ذيل الأسئلة، الصفحات القانونية) بيقرا من هنا — فتغيير القناة هنا بيمشي
   على الموقع كله من غير ما حاجة تفضل بتوري الإيميل والزائر يتودّي واتساب. */
export type ContactChannel = 'whatsapp' | 'email' | 'community';

export const contactChannel: ContactChannel = SITE_LINKS.whatsapp
  ? 'whatsapp'
  : SITE_LINKS.email
    ? 'email'
    : 'community';

/* ─── الرسالة الجاهزة على واتساب ───
   أول ما الزائر يضغط «تواصل» بيلاقي المحادثة مكتوب فيها السطر ده بدل خانة
   فاضية — احتكاك أقل، وبتوصلنا عارفين هو جاي منين. عربي لأن ده لسان
   الجمهور، وبتشتغل عادي حتى في واجهة الإنجليزي. سيبها '' لو عايز اللينك
   يفتح فاضي. (بتخصّ واتساب بس — mailto/المجتمع مالهمش `text`.) */
const CONTACT_WHATSAPP_MESSAGE = 'أهلاً، عندي سؤال عن ماجيكلي';

/** بيحطّ ?text= (أو &text= لو اللينك فيه باراميتر أصلاً من override) مع
    ترميز الرسالة. الترميز مهم: النص عربي وفيه مسافات، ومن غيره اللينك
    بيتكسر عند أول مسافة. */
function withWhatsappText(url: string, message: string): string {
  if (!message) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}text=${encodeURIComponent(message)}`;
}

/** لينك التواصل المستخدم في الفوتر وذيل الأسئلة والصفحات القانونية. */
export const contactHref =
  contactChannel === 'whatsapp'
    ? withWhatsappText(SITE_LINKS.whatsapp, CONTACT_WHATSAPP_MESSAGE)
    : contactChannel === 'email'
      ? `mailto:${SITE_LINKS.email}`
      : '/community';

/** لينك بيفتح تطبيق/موقع تاني في تبويب جديد (واتساب) — محتاج
    target=_blank و rel أمان. mailto مابيفتحش تبويب، والمجتمع راوت
    داخلي — الاتنين مش «خارجيين» بالمعنى ده. */
export const contactIsExternal = contactChannel === 'whatsapp';

/** نص اللينك المعروض افتراضياً. للإيميل بنوري العنوان نفسه (معلومة
    مفيدة للزائر)، ولواتساب/المجتمع كلمة واضحة. الفوتر بيترجم بمفتاح
    قاموس عشان اللغتين؛ الصفحات القانونية (عربي بس) بتستعمل ده زي ما هو —
    فالنص دايماً بيطابق وجهة اللينك، مايكدبش على الزائر. */
export const contactLabel =
  contactChannel === 'email'
    ? SITE_LINKS.email
    : contactChannel === 'whatsapp'
      ? 'واتساب'
      : 'المجتمع';

/** توافق مع كود قديم كان بيفرّق بين الإيميل وغيره. */
export const contactIsEmail = contactChannel === 'email';
