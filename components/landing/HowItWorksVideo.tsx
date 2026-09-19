'use client';

import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { HOW_IT_WORKS_VIDEO_URL } from '@/lib/seo';
import styles from './HowItWorksVideo.module.css';

/**
 * قسم "إزاي بتشتغل ماجيكلي؟" — مشغّل الفيديو الجاي في الكارت الزجاجي.
 *
 * - الفيديو **placeholder** دلوقتي: اللينك مصدره `lib/seo.ts`
 *   (HOW_IT_WORKS_VIDEO_URL) عشان المشغّل والـ JSON-LD يبقوا على نفس
 *   الفيديو. لما الفيديو النهائي يجهز بيغير قيمة واحدة بس.
 * - `preload="none"` = مفيش تحميل للفيديو لحد ما المستخدم يضغط play —
 *   اللاندينج بتتحمل بسرعة (Core Web Vitals).
 * - لينك "افتح الفيديو" تحت المشغّل: fallback لو المشغّل نفسه ما
 *   اشتغلش + لينك حقيقي لقارئ الشاشة وللـ SEO.
 */
export default function HowItWorksVideo() {
  const { t } = useLanguage();

  return (
    <section id="video" className={styles.section} aria-labelledby="video-heading">
      <ScrollReveal className={styles.head}>
        <h2 id="video-heading">{t.video_title}</h2>
        <p className={styles.lede}>{t.video_lede}</p>
      </ScrollReveal>

      <ScrollReveal delay={0.12} className={styles.playerWrap}>
        <div className={styles.glass}>
          <video
            className={styles.video}
            src={HOW_IT_WORKS_VIDEO_URL}
            controls
            playsInline
            preload="none"
            title={t.video_title}
          />
        </div>
        <a
          href={HOW_IT_WORKS_VIDEO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.openLink}
        >
          {t.video_open}
          <span aria-hidden="true" className={styles.openLinkArrow}>↗</span>
        </a>
      </ScrollReveal>
    </section>
  );
}
