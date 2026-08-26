'use client';

import styles from './PreviewCard.module.css';

export default function PreviewCard({ mode }: { mode?: string }) {
  const lessonMode = mode === 'lesson';

  if (lessonMode) {
    return (
      <div className={styles.previewCard}>
        <div className={styles.previewTopbar}>
          <span>ماجيكلي · درس: بيولوجيا الخلية</span>
          <button className={styles.topbarClose}>✕</button>
        </div>
        <div className={styles.previewBody}>
          <div className={styles.leftColumn}>
            <div className={styles.pFile}>
              <div className={styles.pFileLeft}>
                <span className={styles.pIcon}>🎥</span>
                <span className={styles.pFileTitle}>فيديو الدرس</span>
              </div>
              <span className={styles.pFileCta}>تشغيل</span>
            </div>
            <div className={`${styles.pMiniCard} ${styles.checked}`}>
              <span className={styles.cardIcon}>🤖</span>
              <div>
                <b>المساعد الذكي</b>
                <ul className={styles.checklist}>
                  <li>اشرحلي الجزء ده بطريقة أبسط</li>
                  <li>النواة زي مخ الخلية، بتتحكم في كل حاجة</li>
                </ul>
              </div>
            </div>
            <div className={styles.pFile}>
              <div className={styles.pFileLeft}>
                <span className={styles.pIcon}>📝</span>
                <span className={styles.pFileTitle}>لخّص · اختبرني · بطاقات</span>
              </div>
            </div>
          </div>
          <div className={styles.rightNav}>
            <div className={`${styles.pNavItem} ${styles.active}`}>📖 الدرس</div>
            <div className={styles.pNavItem}>📎 المصادر</div>
            <div className={styles.pNavItem}>🎥 الفيديوهات</div>
            <div className={styles.pNavItem}>📝 الملاحظات</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.previewCard}>
      <div className={styles.previewTopbar}>
        <span>ماجيكلي · مساحة العمل</span>
        <button className={styles.topbarClose}>⋯</button>
      </div>
      <div className={styles.previewBody}>
        <div className={styles.leftColumn}>
          <div className={styles.pFile}>
            <div className={styles.pFileLeft}>
              <div className={styles.pFileBadge}>PDF</div>
              <span className={styles.pFileName}>محاضرة_نظم_التشغيل.pdf</span>
            </div>
            <span className={styles.pFileCta}>اقرأ بالكامل</span>
          </div>
          <div className={styles.pFocus}>
            <div className={styles.pFocusTop}>
              <span>التركيز الحالي</span>
              <b>7/12 مكتمل</b>
            </div>
            <div className={styles.pBar}>
              <div className={styles.pBarFill} />
            </div>
            <div className={styles.pFocusTag}>الـ Deadlock وشروط حدوثه</div>
          </div>
          <div className={styles.pGrid}>
            <div className={styles.pMini}>
              <span>💡</span>
              <b>بطاقات المراجعة</b>
            </div>
            <div className={`${styles.pMini} ${styles.check}`}>
              <span>ملخص المحاضرة</span>
              <ul className={styles.checklist}>
                <li>أهم الأفكار الأساسية</li>
                <li>شرح مبسط للمفاهيم</li>
              </ul>
            </div>
          </div>
          <div className={styles.pFile}>
            <div className={styles.pFileLeft}>
              <span>❓</span>
              <span className={styles.pFileName}>أسئلة واختبارات</span>
            </div>
            <span className={styles.pFileCta}>5 أسئلة جاهزة</span>
          </div>
        </div>
        <div className={styles.rightNav}>
          <div className={`${styles.pNavItem} ${styles.active}`}>✨ المساعد الذكي</div>
          <div className={styles.pNavItem}>📚 الكورسات</div>
          <div className={styles.pNavItem}>🗂 مساحة العمل</div>
          <div className={styles.pNavItem}>📝 الملاحظات</div>
          <div className={styles.pNavItem}>🎯 المخطط</div>
        </div>
      </div>
    </div>
  );
}
