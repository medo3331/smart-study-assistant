'use client';

/**
 * ❓ قسم الأسئلة الشائعة — أكورديون بعشر أسئلة.
 *
 * ═══ إزاي تعدّل المحتوى ═══
 * المكوّن ده **مابيعرفش أي حاجة** عن نص الأسئلة. كل النصوص في
 * `lib/i18n/dictionaries.ts` تحت `faq1_q`/`faq1_a` … `faq10_q`/`faq10_a`،
 * والترتيب في `lib/faq.ts`.
 *   • تغيّر سؤال؟ غيّر النص في القاموس في اللغتين. خلاص.
 *   • تضيف/تشيل/ترتّب؟ في `lib/faq.ts` مش هنا.
 *
 * ⚠️ القايمة اتنقلت لـ `lib/faq.ts` لأن `lib/seo.ts` بيقرا منها كمان عشان
 * يولّد FAQPage JSON-LD. قاعدة جوجل: البيانات المنظّمة لازم تطابق النص
 * الظاهر — سؤال في الـ JSON-LD مش ظاهر في الشاشة = عقوبة يدوية. المصدر
 * الواحد بيمنع ده هيكلياً بدل ما يعتمد على إن حد يفتكر يحدّث الاتنين.
 *
 * ═══ ليه مكتوب بـ button + region مش <details> ═══
 * `<details>` كان هيدّينا الأكورديون ببلاش، بس مش بينفع معاه حركة فتح
 * ناعمة: المتصفح بيقلب `display` على المحتوى فالارتفاع بيتنطّ من صفر
 * لكامل من غير مراحل بينهم. عشان الحركة تبقى فعلاً ناعمة لازم نحرّك
 * `height: auto` وده محتاج قياس، واللي بيقيس هنا هو Framer عن طريق
 * `height: 'auto'` في الـ animate. المقابل إننا بنكتب الوصولية بإيدينا:
 * aria-expanded و aria-controls و role="region" و aria-labelledby.
 *
 * ═══ واحد مفتوح في المرة ═══
 * الحالة رقم واحد (`openId`) مش مجموعة. السبب مش تقني — قايمة كلها
 * مفتوحة بتبقى حيطة نص، والزائر اللي فتح الرابع بينزل يدوّر على الخامس
 * وسط كلام. الضغط على المفتوح بيقفله (بيرجّع null).
 *
 * ⚠️ ميزانية اللون: نفس قاعدة الميزات والآراء — الفسفوري معناه «إنت
 * هنا». فالأسئلة كلها ساكنة بالحبر، والفسفوري بيظهر على **السؤال
 * المفتوح بس** (خط الهامش + علامة +/−). عشرة أسئلة كلها بأكسنت أصفر
 * كانت هتبقى نفس مشكلة كروت الأيام: حيطة صفرا والعين مش لاقية تركز فين.
 *
 * ⚠️ الحركة: الغلاف اللي Framer بيحرّكه (`.faq-answer-wrap`) ملوش
 * ستايل من الـ CSS غير `overflow: hidden` — لأن Framer بيكتب `height`
 * inline، وأي padding على نفس العنصر بيتحسب فوق الارتفاع المتحرّك
 * فبيعمل قفزة في آخر فريم. الحشو كله على `.faq-answer` اللي جوّه.
 */

import { useId, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, MotionConfig, motion, type Variants } from 'framer-motion';
import { ArrowRight, Plus } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { FAQS } from '@/lib/faq';
import { contactHref, contactIsExternal } from '@/lib/site-links';

/* نفس منحنى الهيرو والميزات والآراء. منحنى واحد في الصفحة كلها هو اللي
   بيخلي الحركات تحس إنها لغة واحدة. */
const EASE = [0.22, 1, 0.36, 1] as const;

const list: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

/* الدخول بإزاحة أصغر من الكروت (١٢ بدل ١٨): دي قايمة سطور متراصة فوق
   بعض، والإزاحة الكبيرة بتخلي العشر سطور تتحرك كأنها ستارة بتتفتح. */
const rowIn: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

export interface FaqSectionProps {
  /** وضع الملخّص في اللاندينج: أول N سؤال بس، والباقي في صفحة الأسئلة. */
  limit?: number;
  /** لينك «كل الأسئلة» تحت القايمة. وضع الملخّص بس. */
  moreHref?: string;
  /** وضع الصفحة المستقلة (/faq): عنوان h1 ولينك رجوع فوقه. */
  asPage?: boolean;
}

export function FaqSection({ limit, moreHref, asPage = false }: FaqSectionProps) {
  const { t } = useLanguage();

  /* الملخّص بياخد أول N بالترتيب. الترتيب في lib/faq.ts مرتّب بالأهم
     الأول، فأول ٥ هي أكتر أسئلة الزائر بيسألها قبل ما يسجّل. */
  const items = typeof limit === 'number' ? FAQS.slice(0, limit) : FAQS;

  /* واحد مفتوح في المرة. null = الكل مقفول (الحالة الافتتاحية —
     الزائر بيشوف الأسئلة كلها في شاشة واحدة ويختار). */
  const [openId, setOpenId] = useState<number | null>(null);

  /* أساس ثابت للـ id's. useId بيدّي قيمة متطابقة بين السيرفر والعميل،
     فمفيش تحذير hydration ولا تصادم لو القسم اتكرر في صفحة تانية. */
  const uid = useId();

  return (
    /* reducedMotion="user": Framer بيقرا التفضيل من المتصفح، فبيلغي
       الإزاحة والارتفاع المتحرّك ويسيب الشفافية — الأكورديون بيفضل
       يفتح ويقفل عادي، بس من غير انزلاق. */
    <MotionConfig reducedMotion="user">
      <section className={`band${asPage ? ' band-top' : ''}`} id="faq">
        {asPage && (
          <Link href="/" className="legal-back">
            <ArrowRight size={15} strokeWidth={1.9} aria-hidden="true" />
            <span>{t.sub_back_home}</span>
          </Link>
        )}

        <p className="eyebrow">{t.faq_eyebrow}</p>
        {asPage ? (
          <h1 className="h1">{t.faq_title}</h1>
        ) : (
          <h2 className="h2 measure-tight">{t.faq_title}</h2>
        )}
        <p className="lede features-lede">{t.faq_lede}</p>

        <motion.ul
          className="faq-list"
          variants={list}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
        >
          {items.map(({ id, qKey, aKey }, i) => {
            const isOpen = openId === id;
            const btnId = `${uid}-faq-btn-${id}`;
            const panelId = `${uid}-faq-panel-${id}`;

            return (
              <motion.li
                key={id}
                className={`faq-item${isOpen ? ' is-open' : ''}`}
                variants={rowIn}
              >
                {/* h3 حوالين الزرار: الأسئلة عناوين فرعية جوه القسم،
                    وكده قارئ الشاشة يقدر يتنقل بينها بقايمة العناوين
                    بدل ما يمشي سطر سطر. */}
                <h3 className="faq-q-heading">
                  <button
                    type="button"
                    id={btnId}
                    className="faq-q"
                    aria-expanded={isOpen}
                    /* ⚠️ aria-controls بيتحط **وهو مفتوح بس**، مش دايماً.
                       السبب إن الإجابة المقفولة مش موجودة في الـ DOM
                       خالص (AnimatePresence بيشيلها) — و aria-controls
                       بيشاور على id مش موجود بيبقى قيمة غير صالحة،
                       وأدوات الفحص (axe) بتبلّغ عنها. مفيش خسارة في
                       شيله وهو مقفول: وظيفته إنه يودّي المستخدم للعنصر
                       المرتبط، وهو مقفول مفيش حاجة يوديه ليها —
                       والحالة نفسها بيبلّغها aria-expanded. */
                    {...(isOpen ? { 'aria-controls': panelId } : {})}
                    onClick={() => setOpenId(isOpen ? null : id)}
                  >
                    {/* رقم السؤال بخط المونوسبيس — بيدّي القايمة إيقاع
                        بصري وبيخلي الزائر يعرف هو فين في العشرة.
                        .ltr-num عشان الرقم ما يتقلبش في الاتجاه العربي. */}
                    <span className="faq-num ltr-num mono" aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>

                    <span className="faq-q-text">{t[qKey]}</span>

                    {/* العلامة: + بتلف ٤٥ درجة فتبقى ×. أرخص من تبديل
                        أيقونتين، وبتدي إحساس إن نفس العنصر اتحرك.
                        aria-hidden لأن aria-expanded على الزرار هو اللي
                        بيبلّغ الحالة فعلاً. */}
                    <motion.span
                      className="faq-sign"
                      aria-hidden="true"
                      animate={{ rotate: isOpen ? 45 : 0 }}
                      transition={{ duration: 0.28, ease: EASE }}
                    >
                      <Plus size={18} strokeWidth={2} />
                    </motion.span>
                  </button>
                </h3>

                {/* initial={false} مهم: من غيره كل الإجابات المقفولة
                    بتعمل حركة قفل وهمية أول ما الصفحة تحمّل. */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="answer"
                      className="faq-answer-wrap"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        height: { duration: 0.32, ease: EASE },
                        /* الشفافية أسرع في الفتح وأبطأ في القفل عن قصد:
                           النص بيظهر وهو بيتفرد، وبيختفي قبل ما الارتفاع
                           يخلص عشان ما يتقصّش وهو لسه مقروء. */
                        opacity: { duration: 0.22, ease: 'linear' },
                      }}
                    >
                      <div
                        id={panelId}
                        role="region"
                        aria-labelledby={btnId}
                        className="faq-answer"
                      >
                        <p className="faq-answer-text">{t[aKey]}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </motion.ul>

        {/* لينك «كل الأسئلة»: وضع الملخّص عرض ٥ من ١٠، فده بيقول إن فيه كمان.
            وضع الصفحة الكاملة بيعرض بدلها سطر التواصل تحت — الزائر اللي
            قرا كل الأسئلة وما لقاش سؤاله محتاج طريق يوصل بيها، مش لينك
            بيرجّعه لنفس الصفحة. */}
        {moreHref ? (
          <p className="section-more">
            <Link className="faq-more-link" href={moreHref}>
              {t.faq_see_all}
            </Link>
          </p>
        ) : (
          /* الذيل: الزائر اللي ما لقاش سؤاله. لينك التواصل بييجي من
             lib/site-links — واتساب لو متظبط، وإلا إيميل، وإلا المجتمع. */
          <p className="faq-more">
            <span className="muted">{t.faq_more_text}</span>{' '}
            <a
              className="faq-more-link"
              href={contactHref}
              {...(contactIsExternal
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
            >
              {t.faq_more_cta}
            </a>
          </p>
        )}
      </section>
    </MotionConfig>
  );
}
