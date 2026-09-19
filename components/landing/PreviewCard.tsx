'use client';

import { useLanguage } from '@/lib/i18n/LanguageProvider';
import styles from './PreviewCard.module.css';

/* مكيت الداشبورد اللي جوه اللاندينج.
   ⚠️ كل النص مأخوذ من القاموس: نصوص "مساحة العمل" بتاخد مفاتيح mock_*
   الجاهزة (نفس اللي بتاخدها معاينات /demo)، ونصوص الدرس بتاخد preview_*.
   الأرقام (7/12) زيادية تصميمية ففوقها حرفي. */
export default function PreviewCard({ mode }: { mode?: string }) {
  const { t } = useLanguage();
  const lessonMode = mode === 'lesson';

  if (lessonMode) {
    return (
      <div className={styles.previewCard}>
        <div className={styles.previewTopbar}>
          <span>
            {t.brand} · {t.preview_lesson_label} {t.preview_lesson_topic}
          </span>
          <button className={styles.topbarClose} aria-hidden="true" tabIndex={-1}>✕</button>
        </div>
        <div className={styles.previewBody}>
          <div className={styles.leftColumn}>
            <div className={styles.pFile}>
              <div className={styles.pFileLeft}>
                <span className={styles.pIcon} aria-hidden="true">🎥</span>
                <span className={styles.pFileTitle}>{t.preview_video}</span>
              </div>
              <span className={styles.pFileCta}>{t.preview_play}</span>
            </div>
            <div className={`${styles.pMiniCard} ${styles.checked}`}>
              <span className={styles.cardIcon} aria-hidden="true">🤖</span>
              <div>
                <b>{t.mock_nav_ai}</b>
                <ul className={styles.checklist}>
                  <li>{t.preview_ask1}</li>
                  <li>{t.preview_ask2}</li>
                </ul>
              </div>
            </div>
            <div className={styles.pFile}>
              <div className={styles.pFileLeft}>
                <span className={styles.pIcon} aria-hidden="true">📝</span>
                <span className={styles.pFileTitle}>{t.preview_tools}</span>
              </div>
            </div>
          </div>
          <div className={styles.rightNav}>
            <div className={`${styles.pNavItem} ${styles.active}`}>
              <span aria-hidden="true">📖</span> {t.preview_nav_lesson}
            </div>
            <div className={styles.pNavItem}>
              <span aria-hidden="true">📎</span> {t.preview_nav_sources}
            </div>
            <div className={styles.pNavItem}>
              <span aria-hidden="true">🎥</span> {t.preview_nav_videos}
            </div>
            <div className={styles.pNavItem}>
              <span aria-hidden="true">📝</span> {t.mock_nav_notes}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.previewCard}>
      <div className={styles.previewTopbar}>
        <span>
          {t.brand} · {t.mock_nav_workspace}
        </span>
        <button className={styles.topbarClose} aria-hidden="true" tabIndex={-1}>⋯</button>
      </div>
      <div className={styles.previewBody}>
        <div className={styles.leftColumn}>
          <div className={styles.pFile}>
            <div className={styles.pFileLeft}>
              <div className={styles.pFileBadge}>PDF</div>
              <span className={styles.pFileName}>{t.demo_file}</span>
            </div>
            <span className={styles.pFileCta}>{t.mock_upload_ok}</span>
          </div>
          <div className={styles.pFocus}>
            <div className={styles.pFocusTop}>
              <span>{t.mock_focus_label}</span>
              <b>
                <span dir="ltr">7/12</span> {t.mock_progress}
              </b>
            </div>
            <div className={styles.pBar}>
              <div className={styles.pBarFill} />
            </div>
            <div className={styles.pFocusTag}>{t.mock_topic}</div>
          </div>
          <div className={styles.pGrid}>
            <div className={styles.pMini}>
              <span aria-hidden="true">💡</span>
              <b>{t.mock_flash_title}</b>
            </div>
            <div className={`${styles.pMini} ${styles.check}`}>
              <span>{t.mock_summary_title}</span>
              <ul className={styles.checklist}>
                <li>{t.mock_summary1}</li>
                <li>{t.mock_summary2}</li>
              </ul>
            </div>
          </div>
          <div className={styles.pFile}>
            <div className={styles.pFileLeft}>
              <span aria-hidden="true">❓</span>
              <span className={styles.pFileName}>{t.mock_quiz_title}</span>
            </div>
            <span className={styles.pFileCta}>{t.mock_quiz_sub}</span>
          </div>
        </div>
        <div className={styles.rightNav}>
          <div className={`${styles.pNavItem} ${styles.active}`}>
            <span aria-hidden="true">✨</span> {t.mock_nav_ai}
          </div>
          <div className={styles.pNavItem}>
            <span aria-hidden="true">📚</span> {t.mock_nav_courses}
          </div>
          <div className={styles.pNavItem}>
            <span aria-hidden="true">🗂</span> {t.mock_nav_workspace}
          </div>
          <div className={styles.pNavItem}>
            <span aria-hidden="true">📝</span> {t.mock_nav_notes}
          </div>
          <div className={styles.pNavItem}>
            <span aria-hidden="true">🎯</span> {t.mock_nav_planner}
          </div>
        </div>
      </div>
    </div>
  );
}
