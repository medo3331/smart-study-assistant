'use client';
import { useMemo } from 'react';
import { MagicMascot } from './MagicMascot';
import {
  PERSONA_NAME,
  getTimeBasedGreeting,
  getRandomEncouragement,
  estimateMinutes,
} from '@/lib/persona';

export interface CoachTask {
  id: string;
  label: string; // مثال: "درس Signals" أو "اختبار HTML"
  icon?: string; // إيموجي بسيط، اختياري
}

export function AIStudyCoach({
  userName,
  tasks,
  accentClassName = 'text-emerald-500',
  accentBg,
  onAsk,
}: {
  userName: string;
  tasks: CoachTask[];
  /** لون قلم الثيم للشخصية — نص Tailwind */
  accentClassName?: string;
  /** خلفية زرار "اسأل ماجيك" — بييجي من themeStyles.accentBg */
  accentBg?: string;
  onAsk?: () => void;
}) {
  const greeting = useMemo(() => getTimeBasedGreeting(), []);
  const encouragement = useMemo(() => getRandomEncouragement(), []);
  const estimatedMinutes = estimateMinutes(tasks.length);

  return (
    // 📓 الكارت ده هو "ورقة ماجيك": ورقة بهامش أحمر، والمهام مكتوبة
    // على خطوط الدفتر فعلاً (.ruled + سطر ٣٢px) مش في ليستة بإيموجي.
    <div className="sheet-card p-5" dir="rtl">
      <div className="flex items-start gap-4">
        {/* ماجيك نفسه — مرسوم SVG، بيهزّ إيده بس لما يبقى فيه شغل */}
        <MagicMascot
          className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 text-ink"
          accentClassName={accentClassName}
          waving={tasks.length > 0}
        />

        <div className="flex-1 min-w-0">
          <p className="tag mb-1.5">{PERSONA_NAME} · مساعد المذاكرة</p>

          {/* فقاعة الكلام: سنّها ناحية ماجيك، وبتلف لوحدها في LTR */}
          <div className="bubble p-3 mb-3">
            <p className="text-sm font-semibold text-ink m-0">
              {greeting} يا {userName}
            </p>
            <p className="text-[11px] text-ink-soft italic m-0 mt-1">{encouragement}</p>
          </div>

          {tasks.length > 0 ? (
            <>
              <p className="mono mb-1">متبقّي النهارده</p>
              <ul className="ruled mb-3 list-none p-0 m-0">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    className="h-8 leading-8 text-sm text-ink truncate"
                  >
                    {task.label}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-ink-soft mb-3">
                لو بدأت دلوقتي، هتخلّص في حوالي{' '}
                <span className="font-mono font-bold text-ink tnum">
                  {estimatedMinutes}
                </span>{' '}
                دقيقة
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-soft mb-3">
              خلّصت كل حاجة النهارده. الورقة نضيفة.
            </p>
          )}

          {onAsk && (
            <button
              type="button"
              onClick={onAsk}
              className={
                accentBg
                  ? `btn ${accentBg} text-onmarker hover:opacity-90`
                  : 'btn btn-quiet'
              }
            >
              اسأل {PERSONA_NAME}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
