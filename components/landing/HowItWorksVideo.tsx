'use client';

import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { HOW_IT_WORKS_VIDEO_URL } from '@/lib/seo';
import styles from './HowItWorksVideo.module.css';

/** قسم "إزاي بتشتغل ماجيكلي؟" — مشغّل الفيديو في الكارت الزجاجي. */
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
          <div className="relative w-full aspect-video rounded-xl overflow-hidden">
            <iframe
              src="https://www.youtube-nocookie.com/embed/n-i4PVpIb3k"
              title={t.video_title}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          </div>
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
