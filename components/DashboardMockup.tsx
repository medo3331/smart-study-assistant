'use client';

import { useLanguage } from '@/lib/i18n/LanguageProvider';

/* ==========================================================================
   ماكيت الداشبورد — بيمثّل تلات مراحل من المنتج الحقيقي

   ليه مرسوم بالـ HTML مش صورة:
   ١) صورة PNG لواجهة فيها نص عربي بتبقى تقيلة وبتتكسر على الشاشات العالية،
      والنص جواها مش بيتقرا لا لقارئ الشاشة ولا لجوجل.
   ٢) الماكيت بيورّث توكنز الثيم، فبيقلب ليل/نهار مع باقي الصفحة لوحده.
      صورة كانت هتحتاج نسختين وتفضل غلط في الثيم التاني.
   ٣) صفر ريكوستات على الشبكة.
   ٤) **والأهم دلوقتي**: الماكيت بيتحرك على تلات مراحل. صورة كانت هتحتاج
      تلات صور × تيمين × لغتين.

   الأسماء والنصوص كلها جاية من الداشبورد الحقيقي (nav-config.ts و
   HeroSection.tsx) — الزائر لازم يلاقي نفس الحاجة اللي شافها.

   ⚠️ الحركة كلها CSS transitions على تغيّر الكلاس، مش JS. اللي بيتغيّر
   من بره هو رقم المرحلة بس — ده معناه إن الحركة بتشتغل على الـ compositor
   وبتحترم prefers-reduced-motion من الستايل شيت مباشرة.
   ========================================================================== */

/** مراحل التتابع: رفع ← توليد ← جاهز. */
export const MOCKUP_STAGES = 3;

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ChevronIcon({ rtl }: { rtl: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={rtl ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  );
}

export function DashboardMockup({ stage = 2 }: { stage?: number }) {
  const { t } = useLanguage();
  const isRtl = t.dir === 'rtl';

  const navItems = [
    { icon: '🏠', label: t.mock_nav_home },
    { icon: '📚', label: t.mock_nav_courses },
    { icon: '🗂️', label: t.mock_nav_workspace },
    { icon: '🤖', label: t.mock_nav_ai, active: true },
    { icon: '📝', label: t.mock_nav_notes },
    { icon: '🎯', label: t.mock_nav_planner },
  ];

  const summary = [t.mock_summary1, t.mock_summary2, t.mock_summary3];

  /* حالة الملف بتفرق في التلات مراحل: بيترفع ← اتقرا ← جاهز.
     ودي أوضح إشارة إن التتابع ماشي، فمستحقة تبقى أول حاجة تتغيّر. */
  const fileSub =
    stage === 0 ? t.stage_uploading : stage === 1 ? t.stage_reading : t.mock_upload_ok;

  return (
    /* الماكيت كله صورة واحدة لقارئ الشاشة: قراية ٣٠ عنصر واجهة مزيّفة
       عنصر عنصر مش بتفيد حد. والوصف بيوصف **التتابع كله** مرة واحدة —
       لو كان بيتغيّر مع كل مرحلة كان قارئ الشاشة هيعيد الكلام كل تلات
       ثواني على طول. */
    <div className={`hm is-stage-${stage}`} role="img" aria-label={t.stage_sequence_label}>
      <div className="hm-chrome" aria-hidden="true">
        <span className="hm-dot" />
        <span className="hm-dot" />
        <span className="hm-dot" />
        <span className="hm-urlbar">
          {t.brand} · {t.mock_nav_workspace}
        </span>
      </div>

      <div className="hm-body" aria-hidden="true">
        <aside className="hm-side">
          <div className="hm-brand">
            <span className="hm-brand-mark">📓</span>
            <span className="hm-brand-name">{t.brand}</span>
          </div>
          <ul className="hm-nav">
            {navItems.map((item) => (
              <li key={item.label} className={`hm-nav-item${item.active ? ' is-active' : ''}`}>
                <span className="hm-nav-icon">{item.icon}</span>
                <span className="hm-nav-label">{item.label}</span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="hm-main">
          {/* الملف المرفوع — هو أصل الحكاية، فمستحق يبان فوق */}
          <div className="hm-card hm-file">
            <span className="hm-file-badge">PDF</span>
            <div className="hm-file-meta">
              <p className="hm-file-name">{t.demo_file}</p>
              <p className="hm-file-sub">{fileSub}</p>
              {/* شريط الرفع — بيتشال بعد المرحلة الأولى */}
              <span className="hm-upload" aria-hidden="true">
                <span className="hm-upload-fill" />
              </span>
            </div>
            <span className="hm-check">
              <CheckIcon />
            </span>
          </div>

          {/* التركيز الحالي — الكارت الوحيد اللي بياخد ضربة القلم، بالظبط
              زي ما هو في الداشبورد الحقيقي */}
          <div className="hm-card hm-focus">
            <div className="hm-row">
              <span className="hm-eyebrow">{t.mock_focus_label}</span>
              <span className="hm-count">
                <b>7</b>/12 {t.mock_progress}
              </span>
            </div>
            <p className="hm-topic">
              <span className="mark">{t.mock_topic}</span>
            </p>
            <div className="hm-meter">
              <span className="hm-meter-fill" />
            </div>
            {/* غطاء التوليد: بيظهر في المرحلة الوسطى بس وبيغطي الكارت
                عشان الزائر يشوف الفرق بين "بيتبني" و"جاهز" */}
            <span className="hm-building" aria-hidden="true">
              <span className="hm-building-spin">
                <SpinnerIcon />
              </span>
            </span>
          </div>

          <div className="hm-grid">
            <div className="hm-card hm-summary">
              <p className="hm-card-title">{t.mock_summary_title}</p>
              <ul className="hm-list">
                {summary.map((line, i) => (
                  /* التأخير على كل سطر بيخلي الملخص يبان كأنه بيتكتب
                     سطر ورا سطر بدل ما يظهر مرة واحدة */
                  <li key={line} style={{ transitionDelay: `${i * 90}ms` }}>
                    <span className="hm-tick">
                      <CheckIcon />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="hm-card hm-flash">
              <span className="hm-flash-icon">💡</span>
              <p className="hm-card-title">{t.mock_flash_title}</p>
              <p className="hm-card-sub">{t.mock_flash_count}</p>
            </div>
          </div>

          <div className="hm-card hm-quiz">
            <span className="hm-quiz-icon">?</span>
            <div className="hm-file-meta">
              <p className="hm-card-title">{t.mock_quiz_title}</p>
              <p className="hm-card-sub">{t.mock_quiz_sub}</p>
            </div>
            <span className="hm-chevron">
              <ChevronIcon rtl={isRtl} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
