"use client";

import type { ThemeStyles, UiText } from "./types";

/* ==========================================================================
   ترويسة الداشبورد

   ⚠️ الكارت ده كان فيه شريط أدوات كامل (طوارئ / المزيد / الإعدادات / زرار
   الحساب). الشريط اتشال في ٨ أغسطس وبنوده نزلت للقايمة الجانبية — طلب
   المستخدم كان «قايمة واحدة بس فيها كل حاجة». فالكارت ده بقى عرض بحت:
   ترحيب + مستوى + تقدّم، من غير أي منيو منسدلة.

   لو محتاج تزوّد أداة، مكانها nav-config.ts — مش هنا.
   ========================================================================== */

interface StatsSectionProps {
  level: number;
  xp: number;
  currentLevelProgress: number;
  xpRemaining: number;
  streak: number;
  uiText: UiText;
  themeStyles: ThemeStyles;
  displayName: string;

  /** سطر تحت الاسم: مكانك في الخطة. بييجي جاهز من الصفحة. */
  subtitle: string;

  /** بادچ بس — المفتاح نفسه بقى بند في القايمة الجانبية */
  isEmergencyMode: boolean;
}

export function StatsSection({
  level,
  xp,
  currentLevelProgress,
  xpRemaining,
  streak,
  uiText,
  themeStyles,
  displayName,
  subtitle,
  isEmergencyMode,
}: StatsSectionProps) {
  return (
    <div className="sheet-card p-5 space-y-5">

      {/* ---- الترحيب: الاسم أكبر حاجة في الترويسة ---- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow eyebrow-flush">لوحة التحكم</p>
          <h1 className="h2 mt-1 mb-1 truncate">أهلاً {displayName}</h1>
          <p className="small muted m-0">{subtitle}</p>
        </div>

        {/* الطوارئ بقى مفتاح في القايمة، فالبادچ ده هو التأكيد الوحيد هنا
            إنه شغّال — من غيره الوضع كان هيبقى مخفي عن اللي في الصفحة. */}
        {isEmergencyMode && (
          <span className="tag tag-box bg-red-950 text-red-400 shrink-0">وضع الطوارئ شغّال</span>
        )}
      </div>

      {/* ---- المستوى والتقدم: الختم + المسطرة + كبسولتين ---- */}
      <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-rule">
        <div className={`stamp ${themeStyles.accentBg} text-onmarker`} aria-hidden>
          <span className="mono text-[9px] leading-none opacity-65">LV</span>
          <span className="font-display font-extrabold text-2xl leading-none tnum">{level}</span>
        </div>

        <div className="flex-1 min-w-[240px] space-y-2">
          <div className="flex justify-between items-baseline gap-3">
            <span className="tag">{uiText.xpTitle}</span>
            <span className="font-mono font-bold text-sm text-ink tnum">
              {xp}<span className="text-ink-soft"> XP</span>
            </span>
          </div>

          <div className="meter">
            <div
              className={`meter-fill ${themeStyles.accentBg}`}
              style={{ width: `${Math.max(currentLevelProgress, 4)}%` }}
            />
          </div>

          <p className="text-[11px] text-ink-soft">
            باقي <span className="font-mono font-bold text-ink tnum">{xpRemaining}</span> نقطة للمستوى{" "}
            <span className="font-mono font-bold text-ink tnum">{level + 1}</span>
          </p>
        </div>

        {/* الكبسولتين دول ملخّص، فالرقم فيهم صغير — الأرقام الكبيرة
            مكانها كروت KPI تحت عشان ما يتكررش نفس الرقم بحجمين. */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="pill mono text-ink-soft">
            سلسلة <span className="font-bold text-ink tnum ltr-num">{streak}</span> يوم
          </span>
          <span className="pill mono text-ink-soft">
            <span className="font-bold text-ink tnum ltr-num">{currentLevelProgress}%</span> للمستوى الجديد
          </span>
        </div>
      </div>
    </div>
  );
}
