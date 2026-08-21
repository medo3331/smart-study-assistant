'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MotionConfig, motion, type Variants } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { DashboardMockup, MOCKUP_STAGES } from '@/components/DashboardMockup';

/* منحنى واحد لكل حركة في البطل: بيطلع بسرعة وبيهدى في الآخر.
   استخدام منحنى واحد هو اللي بيخلي التتابع يبان مقصود مش متفرّق. */
const EASE = [0.22, 1, 0.36, 1] as const;

const copyGroup: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

/* الماكيت بيطلع من تحت وبيستقر — تأخير بسيط عشان النص يسبقه */
const stageRise: Variants = {
  hidden: { opacity: 0, y: 30, scale: 0.975 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.8, ease: EASE, delay: 0.16 },
  },
};

/* كبسولات الثقة: مجموعة مستقلة بتيجي بعد الأزرار */
const trustGroup: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.5 } },
};

const trustChip: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

function ArrowIcon() {
  return (
    <svg
      className="hero-cta-arrow"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h13M12 5l7 7-7 7" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.25" />
      <path d="M10 8.5v7l5.5-3.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" />
    </svg>
  );
}

/** مدة كل مرحلة في التتابع. الأخيرة أطول عن قصد — دي المرحلة اللي
    فيها المنتج كامل، ومستحقة وقت الزائر يقراها. */
const STAGE_MS = [2600, 3200, 4200];

/**
 * بيلفّ على مراحل الماكيت بالترتيب وبيرجّع رقم المرحلة الحالية.
 *
 * تلات حمايات مقصودة:
 *   ١) `reduced` → بيستقر على المرحلة الأخيرة (المنتج كامل) ومفيش تايمرز
 *      خالص. المستخدم اللي طالب تقليل الحركة بيشوف صورة ساكنة.
 *   ٢) IntersectionObserver → اللوب بيقف لما الهيرو يخرج من الشاشة.
 *      من غير كده التايمر بيفضل شغال وإنت في آخر الصفحة، وده بياكل
 *      بطارية على الموبايل مقابل صفر فايدة.
 *   ٣) `document.hidden` → بيقف لما التاب يبقى في الخلفية.
 *
 * ⚠️ التوقيت بـ setTimeout متسلسل مش setInterval: كل مرحلة ليها مدة
 * مختلفة، و setInterval بمدة واحدة كان هيخلي المرحلة الأخيرة تمرّ بسرعة
 * زي الأولى.
 */
function useStageLoop(reduced: boolean) {
  const [stage, setStage] = useState(reduced ? MOCKUP_STAGES - 1 : 0);
  /**
   * ⚠️ لازم تكون حالة مش متغير في الـ closure زي `visible` تحت.
   *
   * وقف التايمر لوحده مابيوقفش كل الحركة: الماكيت جوّاه أنيميشن CSS
   * لانهائي (`hm-spin` على مرحلة ١). لما اللوب يقف والمرحلة تتجمّد على
   * ١، الـ spinner بيفضل لافّ وإنت في آخر الصفحة — نفس أكل البطارية
   * اللي التايمر اتعمله حماية أصلاً. الحالة دي بتنزل كلاس على
   * `.hero-stage` بيعمل animation-play-state: paused على اللي جوّه.
   */
  const [onScreen, setOnScreen] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) {
      setStage(MOCKUP_STAGES - 1);
      return;
    }

    const host = hostRef.current;
    if (!host) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let visible = true;
    let current = 0;

    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };

    const tick = () => {
      stop();
      if (!visible || document.hidden) return;
      timer = setTimeout(() => {
        current = (current + 1) % MOCKUP_STAGES;
        setStage(current);
        tick();
      }, STAGE_MS[current]);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        setOnScreen(visible);
        if (visible) tick();
        else stop();
      },
      // ٢٥٪ من الماكيت ظاهرة = يستحق يتحرك. الرقم مش صفر عشان
      // الحركة ماتشتغلش وهو مجرد شعرة داخل الشاشة.
      { threshold: 0.25 }
    );
    observer.observe(host);

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (visible) tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced]);

  return { stage, hostRef, onScreen };
}

/**
 * الجملة المعلّمة بالفسفوري — العنصر المميز في الصفحة.
 *
 * طبقتين فوق بعض بدل ما نحرّك لون النص:
 *   الأساس  = الكلمة بحبر عادي، وهي اللي قارئ الشاشة بيقراها.
 *   الغطاء  = نفس الكلمة بكلاس .mark (أصفر تحتها وحبر كحلي فوقها)،
 *             بتتكشف بـ clip-path من أول السطر لآخره.
 *
 * السبب إن ده أهم من تحريك اللون: --on-marker كحلي ثابت في الثيمين، فلو
 * حرّكنا الأصفر تحت نص فاتح في الثيم الليلي كان فيه ٤٠٠ملي ثانية النص
 * فيها مش مقروء. بالطبقتين، أي نقطة في الحركة إما كحلي على أصفر أو حبر
 * على ورق — الاتنين مقروءين.
 *
 * والتعليم كلمة كلمة مش الجملة كلها: كده الجملة تلف على أكتر من سطر
 * صح، والحركة تحس إن إيد بتمرّ على الورق.
 */
function MarkedPhrase({ text, isRtl, reduced }: { text: string; isRtl: boolean; reduced: boolean }) {
  const words = text.split(/\s+/).filter(Boolean);

  /* الاتجاه: الماركر بيمشي مع القراية — من الشمال في اللاتيني ومن اليمين في العربي.
     كل القيم بالنسبة المئوية على الطرفين عن قصد: Framer بيبدّل بين النصين
     رقم برقم، ولو طرف مكتوب `0` وطرف `0%` الوحدات مش بتتطابق والحركة
     بتنطّ بدل ما تسحب. */
  const from = isRtl ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)';
  const to = 'inset(0% 0% 0% 0%)';

  return (
    <span className="hero-mark-phrase">
      {words.map((word, i) => (
        /* المسافة بين الكلمات مكتوبة صريح: JSX بيشيل الـ whitespace اللي بين
           عناصر الـ map. ومهم تبقى برّا .hero-mark مش جواها — الغطاء بـ
           inset: 0 بيغطي صندوق .hero-mark كله، فلو المسافة جواه الأصفر
           هيمتد عليها والحروف تطلع مزحلقة بعرض مسافة. */
        <Fragment key={`${word}-${i}`}>
          {i > 0 ? ' ' : null}
          <span className="hero-mark">
            <span className="hero-mark-base">{word}</span>
            <motion.span
              className="mark hero-mark-top"
              aria-hidden="true"
              initial={reduced ? { clipPath: to } : { clipPath: from }}
              animate={{ clipPath: to }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: 0.4, ease: EASE, delay: 0.6 + i * 0.12 }
              }
            >
              {word}
            </motion.span>
          </span>
        </Fragment>
      ))}
    </span>
  );
}

export function LandingHero() {
  const { t } = useLanguage();
  const reduced = useReducedMotion();
  const isRtl = t.dir === 'rtl';
  const { stage, hostRef, onScreen } = useStageLoop(reduced);

  /* طبقة تانية فوق MotionConfig: لما الهوك يتأكد إن التفضيل مفعّل،
     بنبدأ من الحالة النهائية خالص فمفيش ولا فريم حركة. */
  const initial = reduced ? 'show' : 'hidden';

  /* ٣ نقط ثقة بس — بتردّ على الاعتراضات اللي بتمنع التسجيل: بيدعم إيه،
     بأي لغة، ومحتاج فلوس ولا لأ. البريف طلب نقطع الرابعة (إجابات من ملفك)
     عشان الهيرو يفضل مرشّق ونقطة القرار واحدة. */
  const trust = [t.trust1, t.trust2, t.trust3];

  /* التتابع اللي الزائر بيقراه جنب الماكيت. الترتيب هو نفسه ترتيب
     المراحل في الماكيت — الاتنين بيتحركوا على نفس الرقم. */
  const stages = [t.stage1_label, t.stage2_label, t.stage3_label];

  /* MotionConfig هي الحماية الأساسية لتقليل الحركة، مش الهوك.
     السبب: الهوك بيقرا الميديا كويري في useEffect، يعني أول رندر بيرجع
     false دايماً — فحركة الدخول كانت هتشتغل مرة على أي حال. Framer
     بيقرا التفضيل من المتصفح مباشرة وقت بداية الحركة، فـ reducedMotion="user"
     بيلغي الإزاحة والتكبير من أول فريم ويسيب الشفافية بس.
     والهوك لسه ليه لزمة: الضربة الفسفورية بـ clip-path مش transform،
     فـ Framer مش بيلغيها لوحده. */
  return (
    <MotionConfig reducedMotion="user">
      <section className="band band-top hero">
        <motion.div
          className="hero-copy"
          variants={copyGroup}
          initial={initial}
          animate="show"
        >
          {/* اللافتة بقت كبسولة: نفس نص .eyebrow بس في إطار — ده اللي
              بيدّي الإحساس الـ SaaS من غير ما نغيّر لغة الموقع */}
          <motion.p className="hero-badge" variants={rise}>
            <span className="hero-badge-spark" aria-hidden="true">
              <SparkIcon />
            </span>
            {t.hero_eyebrow}
          </motion.p>

          {/* الجزء الأخير مشروط: العنوان العربي الحالي بينتهي بالكلمة
              المعلّمة، فـ `hero_title_b` فاضي. من غير الشرط ده كان بيتطبع
              `{' '}` ورا الضربة الفسفورية — مسافة معلّقة آخر العنوان
              بتزوّد عرض السطر وتقدر تسحب الكلمة لسطر لوحدها. */}
          <motion.h1 className="hero-title" variants={rise}>
            {t.hero_title_a} <MarkedPhrase text={t.hero_title_mark} isRtl={isRtl} reduced={reduced} />
            {t.hero_title_b ? ` ${t.hero_title_b}` : null}
          </motion.h1>

          <motion.p className="lede hero-lede" variants={rise}>
            {t.hero_subtitle}
          </motion.p>

          <motion.div className="hero-actions" variants={rise}>
            {/* الإجراء الأساسي بقى «ابدأ خطتك» → تسجيل ← wizard. ده قلب
                البريف الجديد: الهيرو يقود للتسجيل وبدء الخطة على طول.
                الديمو نزل للزرار الثانوي — لسه في متناول اللي عايز يجرّب
                من غير ما يعمل حساب، بس مايزاحمش نداء البداية. */}
            <Link href="/login?next=/assessment" className="btn btn-marker hero-cta">
              {t.hero_cta}
              <ArrowIcon />
            </Link>
            <Link href="/demo" className="btn btn-quiet hero-cta">
              <PlayIcon />
              {t.hero_cta_demo}
            </Link>
          </motion.div>

          {/* كبسولات الثقة: بتردّ على الاعتراضات اللي بتمنع التسجيل —
              بيدعم إيه، بأي لغة، وهيتطلب مني فلوس ولا لأ. قايمة عشان
              دي فعلاً قايمة حقائق مش سطر كلام. */}
          <motion.ul
            className="hero-trust"
            variants={trustGroup}
            initial={initial}
            animate="show"
          >
            {trust.map((item) => (
              <motion.li key={item} className="hero-trust-item" variants={trustChip}>
                <span className="hero-trust-tick" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                {item}
              </motion.li>
            ))}
          </motion.ul>
        </motion.div>

        <div className={`hero-stage${onScreen ? '' : ' is-paused'}`} ref={hostRef}>
          {/* هالة خفيفة بلون الفسفوري — بتفصل الماكيت عن الورق من غير حدود زيادة */}
          <div className="hero-glow" aria-hidden="true" />

          {/* شريط المراحل: تلات خطوات بتتعلّم بالتتابع مع الماكيت.
              aria-hidden لأن الوصف الكامل للتتابع موجود في aria-label
              بتاع الماكيت — من غير كده قارئ الشاشة يقرا نفس الكلام مرتين. */}
          <ol className={`hero-rail is-stage-${stage}`} aria-hidden="true">
            {stages.map((label, i) => (
              <li
                key={label}
                className={`hero-rail-step${i === stage ? ' is-active' : ''}${i < stage ? ' is-done' : ''}`}
              >
                <span className="hero-rail-dot">
                  <span className="hero-rail-num">{i + 1}</span>
                </span>
                <span className="hero-rail-label">{label}</span>
              </li>
            ))}
          </ol>

          {/* الحركة والميل على عنصرين مختلفين عن قصد: Framer بيكتب transform
              inline، فلو الميل كان على نفس العنصر كان هيتمسح مع أول فريم —
              وكمان الميديا كويري اللي بتشيل الميل على الموبايل كانت هتفشل
              لأن الستايل الـ inline بيغلب أي حاجة في الستايل شيت. */}
          <motion.div variants={stageRise} initial={initial} animate="show">
            <div className="hero-mockup-tilt">
              <DashboardMockup stage={stage} />
            </div>
          </motion.div>
        </div>
      </section>
    </MotionConfig>
  );
}
