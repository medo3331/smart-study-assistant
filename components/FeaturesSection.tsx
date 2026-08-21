'use client';

/**
 * ✦ قسم الميزات — لاتناشر كارت، كل واحد ميزة موجودة فعلاً في التطبيق.
 *
 * الكوبي اتكتب من الكود مش من الخيال: كل كارت هنا وراه راوت أو صفحة
 * شغالة (analyze-file، generate-plan، exam-plan، أنماط الشرح الأربعة،
 * الكويز، الـ OCR، speech.ts، السلايدز، المخطط، المسار المهني،
 * المجتمع، التحليلات). لو ميزة اتشالت من الكود، الكارت بتاعها يتشال.
 *
 * ⚠️ ميزانية اللون: الأصفر الفسفوري معناه في المشروع ده «إنت هنا» مش
 * «ده كارت حلو». فالكروت كلها ساكنة بالحبر، والفسفوري بيظهر على
 * الكارت اللي المؤشر عليه بس — يعني بيتبع تركيز المستخدم بدل ما
 * يتحط زينة على اتناشر كارت في وقت واحد. ومفيش ضربة .mark هنا خالص:
 * الهيرو فوق خدها، وضربة واحدة في الشاشة.
 *
 * ⚠️ الحركة والـ transform: الميل بتاع لوحة الأيقونة مكتوب في الـ CSS
 * على `.f-card-icon` جوّه، و Framer بيحرّك `.f-card` اللي برّه — نفس
 * الدرس اللي اتاخد في الهيرو: Framer بيكتب الـ transform inline
 * فبيمسح أي rotate في الستايل شيت لو اتحطوا على نفس العنصر.
 */

import { MotionConfig, motion, type Variants } from 'framer-motion';
import Link from 'next/link';
import {
  AlarmClock,
  ArrowRight,
  CalendarRange,
  ChartNoAxesColumn,
  FileSearch,
  Layers,
  ListChecks,
  Mic,
  Presentation,
  Route,
  ScanText,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/* نفس منحنى الهيرو. استخدام منحنى واحد في الصفحة كلها هو اللي بيخلي
   الحركات تحس إنها لغة واحدة مش أربع مكتبات مركّبة فوق بعض. */
const EASE = [0.22, 1, 0.36, 1] as const;

type FeatureKey = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/* المفاتيح مكتوبة صريحة مش متولّدة بـ `feature${n}_title` عشان الـ
   TypeScript يمسك أي مفتاح ناقص من القاموس وقت الكومبايل. */
const FEATURES: {
  icon: LucideIcon;
  titleKey: keyof Dictionary;
  descKey: keyof Dictionary;
  id: FeatureKey;
}[] = [
  { id: 1, icon: FileSearch, titleKey: 'feature1_title', descKey: 'feature1_desc' },
  { id: 2, icon: CalendarRange, titleKey: 'feature2_title', descKey: 'feature2_desc' },
  { id: 3, icon: Layers, titleKey: 'feature3_title', descKey: 'feature3_desc' },
  { id: 4, icon: ListChecks, titleKey: 'feature4_title', descKey: 'feature4_desc' },
  { id: 5, icon: AlarmClock, titleKey: 'feature5_title', descKey: 'feature5_desc' },
  { id: 6, icon: ScanText, titleKey: 'feature6_title', descKey: 'feature6_desc' },
  { id: 7, icon: Mic, titleKey: 'feature7_title', descKey: 'feature7_desc' },
  { id: 8, icon: Presentation, titleKey: 'feature8_title', descKey: 'feature8_desc' },
  { id: 9, icon: Target, titleKey: 'feature9_title', descKey: 'feature9_desc' },
  { id: 10, icon: Route, titleKey: 'feature10_title', descKey: 'feature10_desc' },
  { id: 11, icon: Users, titleKey: 'feature11_title', descKey: 'feature11_desc' },
  { id: 12, icon: ChartNoAxesColumn, titleKey: 'feature12_title', descKey: 'feature12_desc' },
];

/* الشبكة بتوزّع التأخير على ولادها. التتابع قصير عن قصد (٠.٠٥) —
   اتناشر كارت × ٠.٠٩ (تتابع الهيرو) = تانية وتلت لحد ما آخر كارت يظهر،
   وده بيتقرا بطيء مش أنيق. */
const grid: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const cardIn: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/* حالة الهوفر بتتنشر من الكارت لولاده: الكارت بيعلن `whileHover="lift"`
   والولاد اللي عندهم مفتاح `lift` بيتحركوا معاه من غير أي مستمعات زيادة
   ولا حالة في React. */
const cardLift: Variants = {
  rest: { y: 0 },
  lift: { y: -5, transition: { duration: 0.25, ease: EASE } },
};

/* الميل مكتوب في الـ variants مش في الـ CSS عن قصد. لوحة الأيقونة
   مايلة وهي ساكنة (زي `.stamp` — ختم مضروب بالإيد) وبتتعدل لما المؤشر
   يقع عليها. لو الميل اتكتب في الستايل شيت كان Framer هيمسحه من أول
   فريم، لأنه بيكتب الـ transform inline والـ inline بيغلب الستايل شيت. */
const iconLift: Variants = {
  rest: { rotate: -2.5, scale: 1 },
  lift: { rotate: 0, scale: 1.06, transition: { duration: 0.25, ease: EASE } },
};

export interface FeaturesSectionProps {
  /** وضع الملخّص في اللاندينج: بيعرض أول N كارت بس، والباقي في صفحة الميزات.
      من غيره بيعرض الاتناشر كلهم (وضع صفحة /features). */
  limit?: number;
  /** لينك «شوف الكل» تحت الشبكة. بيظهر في وضع الملخّص بس. */
  moreHref?: string;
  /** وضع الصفحة المستقلة (/features): العنوان يبقى h1 بدل h2، ولينك رجوع
      فوقه. اللاندينج سايباه false عشان عنوان الصفحة الوحيد يفضل الهيرو. */
  asPage?: boolean;
}

export function FeaturesSection({ limit, moreHref, asPage = false }: FeaturesSectionProps) {
  const { t } = useLanguage();

  // الملخّص بياخد أول N بالترتيب — الاتناشر مرتّبين بالأهم الأول أصلاً،
  // فأول ٦ هي الوش اللي عايزين نوريه في اللاندينج.
  const items = typeof limit === 'number' ? FEATURES.slice(0, limit) : FEATURES;

  return (
    /* reducedMotion="user" هي الحماية الأساسية زي الهيرو: Framer بيقرا
       التفضيل من المتصفح وقت بداية الحركة، فبيلغي الإزاحة والتكبير من
       أول فريم ويسيب الشفافية. مفيش هوك هنا لأن مفيش clip-path. */
    <MotionConfig reducedMotion="user">
      <section className={`band${asPage ? ' band-top' : ''}`} id="features">
        {/* وضع الصفحة: لينك رجوع فوق العنوان — الزائر هنا غالباً جاي من
            الفوتر أو ملخّص اللاندينج وعايز يرجع لمكانه. زي صفحات القانوني. */}
        {asPage && (
          <Link href="/" className="legal-back">
            <ArrowRight size={15} strokeWidth={1.9} aria-hidden="true" />
            <span>{t.sub_back_home}</span>
          </Link>
        )}

        <p className="eyebrow">{t.features_eyebrow}</p>
        {/* العنوان h1 في صفحة الميزات المستقلة، h2 لما يكون ملخّص جوه
            اللاندينج — الصفحة لازم يكون فيها عنوان مستوى أول واحد بس. */}
        {asPage ? (
          <h1 className="h1">{t.features_title}</h1>
        ) : (
          <h2 className="h2 measure">{t.features_title}</h2>
        )}
        <p className="lede features-lede">{t.features_lede}</p>

        {/* once: true — الكروت بتظهر مرة واحدة. لو اتكررت مع كل تمريرة
            الصفحة بتحس إنها بتتحمّل من أول وجديد كل شوية.
            amount: 0.15 عشان الصف الأخير ما يستناش يدخل الشاشة كله. */}
        <motion.ul
          className="features"
          variants={grid}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
        >
          {items.map(({ id, icon: Icon, titleKey, descKey }) => (
            <motion.li key={id} className="f-card-wrap" variants={cardIn}>
              {/* الكارت مش عنصر تفاعلي — مفيش لينك ولا onClick. فمفيش
                  tabIndex عليه عن قصد: اتناشر محطة توقّف في الكيبورد
                  ما بتعملش أي حاجة لما توصلها هي إعاقة مش وصولية. */}
              <motion.div
                className="f-card"
                variants={cardLift}
                initial="rest"
                animate="rest"
                whileHover="lift"
              >
                {/* الهالة: تدرّج شعاعي بلون القلم، شفافيته صفر وهو ساكن.
                    منفصل عن الكارت عشان يتحرك بالـ opacity لوحده من غير
                    ما يأثر على قراءة النص فوقه. */}
                <span className="f-card-glow" aria-hidden="true" />

                <motion.span className="f-card-icon" variants={iconLift} aria-hidden="true">
                  {/* strokeWidth 1.6: الافتراضي (2) تقيل جنب خطوط الورق
                      الرفيعة وبيخلي الأيقونة تسحب العين من العنوان. */}
                  <Icon size={22} strokeWidth={1.6} />
                </motion.span>

                <h3 className="f-card-title">{t[titleKey]}</h3>
                <p className="f-card-desc">{t[descKey]}</p>
              </motion.div>
            </motion.li>
          ))}
        </motion.ul>

        {/* لينك «شوف الكل»: بيظهر في وضع الملخّص بس. الملخّص عرض ٦ من ١٢،
            فاللينك ده هو اللي بيقول للزائر إن فيه كمان — من غيره الملخّص
            بيبان كأنه كل الميزات. */}
        {moreHref && (
          <p className="section-more">
            <Link className="faq-more-link" href={moreHref}>
              {t.features_see_all}
            </Link>
          </p>
        )}
      </section>
    </MotionConfig>
  );
}
