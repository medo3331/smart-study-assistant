"use client";

import { useMemo } from "react";
import {
  getPersonalAssistantBriefing,
  type BriefingResult,
} from "@/lib/personal-assistant/briefing";
import type { Persona } from "@/lib/user-persona";
import type { PersonalAssistantContext } from "@/lib/personal-assistant/context";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PersonalAssistantProps {
  /**
   * السياق الحقيقي من الداشبورد (Phase 2A) — بيحمل بيانات فعلية
   * (الخطة/الأهداف/النشاط/الستريك). لو غايب، الكارت بيشتغل على فولباك ثابت
   * (الاسم والشخصية بس) — عشان ما يقعش في أي شاشة بتستخدمه من غير سياق.
   */
  context?: PersonalAssistantContext;
  /** اسم العرض — فولباك بس لما مفيش context */
  displayName?: string;
  /** الشخصية — فولباك بس لما مفيش context */
  persona?: Persona | null;
  /** دالة تسكرول لخطوة اليوم — نفس onContinue في HeroCard */
  onContinue?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PersonalAssistant({
  context,
  displayName = "مستخدم",
  persona,
  onContinue,
}: PersonalAssistantProps) {
  // السياق المطبّع: الحقيقي من الداشبورد لو وصل، وإلا فولباك ثابت.
  const ctx: PersonalAssistantContext = useMemo(() => {
    if (context) return context;
    return {
      userName: displayName,
      role: persona || null,
      studentLevel: null,
      subject: null,
      streak: 0,
      xp: 0,
      studyProgress: null,
      goals: null,
      recentActivity: null,
    };
  }, [context, displayName, persona]);

  const briefing: BriefingResult = useMemo(
    () => getPersonalAssistantBriefing({ ctx }),
    [ctx],
  );

  const baseLines = briefing.baseMessage.split("\n");

  // رسائل إضافية من السياق الحقيقي
  const extraLines: { type: "progress" | "goals"; text: string }[] = [];
  if (briefing.progressMessage) {
    extraLines.push({ type: "progress", text: briefing.progressMessage });
  }
  if (briefing.goalsMessage) {
    extraLines.push({ type: "goals", text: briefing.goalsMessage });
  }

  return (
    <section
      aria-label="المساعد الشخصي"
      className="sheet-card card-lift overflow-hidden motion-safe:animate-[paReveal_.45s_cubic-bezier(.22,.8,.36,1)_both]"
      style={{ animationName: "paReveal" }}
    >
      <div className="relative p-5 sm:p-6">
        {/* لافتة القسم */}
        <p className="eyebrow mb-4">المساعد الشخصي</p>

        {/* الرأس: أفاتار + تحية */}
        <div className="flex items-center gap-4">
          <div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.5px] border-rule-strong bg-paper-3 motion-safe:animate-[paBreathe_5s_ease-in-out_infinite]"
            style={{
              boxShadow:
                "0 0 0 5px rgba(245,222,114,0.30), 0 2px 6px var(--shade)",
            }}
            role="img"
            aria-label="مساعدك الشخصي"
          >
            {/* أيقونة وجه ودودة */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7 stroke-ink"
              aria-hidden
            >
              <path d="M8 21h8M12 17v4" />
              <rect x="4" y="3" width="16" height="14" rx="4.5" />
              <path d="M9 9.2h.01M15 9.2h.01" strokeWidth="2.3" />
              <path d="M9.2 12.6c.8.9 1.7 1.35 2.8 1.35s2-.45 2.8-1.35" />
            </svg>
            {/* نقطة حية */}
            <span
              className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-[2.5px] border-paper-2 motion-safe:animate-[paPulseDot_2.8s_ease-in-out_infinite]"
              style={{
                background: "var(--hl-yellow-deep)",
                boxShadow: "0 0 0 1px var(--hl-yellow-ink)",
              }}
              aria-hidden
            />
          </div>

          <div className="min-w-0 flex flex-col gap-1.5">
            <h2 className="font-display text-[1.1rem] font-bold leading-relaxed text-ink">
              {briefing.greeting}
            </h2>
            <div className="flex flex-wrap items-center gap-2.5">
              <ClockChip period={briefing.timePeriod} />
              <span className="tag">خلاص اليوم في وشي 🌙</span>
            </div>
          </div>
        </div>

        {/* فاصل دفتر */}
        <div
          className="my-4 h-px"
          style={{ background: "var(--rule)" }}
          role="presentation"
        />

        {/* الرسالة الثابتة + رسائل إضافية */}
        <div className="flex flex-col gap-2" aria-live="polite">
          {baseLines.map((line, i) => (
            <p key={i} className="flex items-baseline gap-2.5 text-sm leading-[1.9] text-ink">
              <span
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: "var(--hl-yellow-deep)" }}
                aria-hidden
              />
              <HighlightLine text={line} />
            </p>
          ))}

          {/* رسائل التقدم */}
          {extraLines
            .filter((e) => e.type === "progress")
            .map((line, i) => (
              <p
                key={`progress-${i}`}
                className="flex items-baseline gap-2.5 text-sm leading-[1.9] text-ink"
              >
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--hl-purple-fill)" }}
                  aria-hidden
                />
                <span className="flex-1">{line.text}</span>
              </p>
            ))}

          {/* رسائل الأهداف */}
          {extraLines
            .filter((e) => e.type === "goals")
            .map((line, i) => (
              <div
                key={`goals-${i}`}
                className="mt-3.5 flex items-start gap-2.5 rounded-[var(--r-sm)] p-3"
                style={{
                  background: "rgba(245,222,114,0.16)",
                  border: "1px solid rgba(226,201,92,0.45)",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 h-[17px] w-[17px] shrink-0"
                  style={{ stroke: "var(--hl-yellow-ink)" }}
                  aria-hidden
                >
                  <path d="M22 10L12 5 2 10l10 5 10-5z" />
                  <path d="M6 12v5c0 1.7 2.7 6 3s6-1.3 6-3v-5" />
                </svg>
                <span className="text-sm leading-[1.85] font-medium text-ink whitespace-pre-line">
                  {line.text}
                </span>
              </div>
            ))}
        </div>

        {/* رسائل السياق الحقيقي المفقودة من briefing */}
        {briefing.streakMessage && (
          <div className="mt-3 flex items-baseline gap-2.5 text-sm leading-[1.9] text-ink">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#CE5A6C" }} aria-hidden />
            <span className="font-medium">{briefing.streakMessage}</span>
          </div>
        )}
        {briefing.xpMessage && (
          <div className="mt-2 flex items-baseline gap-2.5 text-sm leading-[1.9] text-ink">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#E2C95C" }} aria-hidden />
            <span className="font-medium">{briefing.xpMessage}</span>
          </div>
        )}
        {briefing.activityMessage && (
          <div className="mt-2 flex items-baseline gap-2.5 text-sm leading-[1.9] text-ink">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#2A7A4B" }} aria-hidden />
            <span className="font-medium">{briefing.activityMessage}</span>
          </div>
        )}
        {briefing.launchMessage && (
          <div className="mt-2 text-sm leading-[1.9] text-ink-soft italic">{briefing.launchMessage}</div>
        )}

        {/* سطر الدور */}
        {briefing.roleMessage && (
          <RoleLine message={briefing.roleMessage} />
        )}

        {/* التذييل */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
          <span className="mono text-[11px] tracking-wide text-ink-soft">
            قريبًا · بريفينج ذكي بيفهم يومك
          </span>
          {onContinue && (
            <button
              type="button"
              onClick={onContinue}
              className="btn btn-marker text-sm"
            >
              نبدأ خطوة النهارده
            </button>
          )}
        </div>
      </div>

      {/* keyframes مضمّنة عشان ملفها مفيش مكان تاني — مش غلوبال */}
      <style jsx>{`
        @keyframes paReveal {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        @keyframes paBreathe {
          0%,
          100% {
            box-shadow: 0 0 0 4px rgba(245,222,114, 0.25),
              0 2px 6px var(--shade);
          }
          50% {
            box-shadow: 0 0 0 7px rgba(245,222,114, 0.38),
              0 2px 6px var(--shade);
          }
        }
        @keyframes paPulseDot {
          0%,
          100% {
            opacity: 0.5;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ClockChip({ period }: { period: "morning" | "evening" }) {
  const timeStr = useMemo(() => {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, "0");
    const m = now.getMinutes().toString().padStart(2, "0");
    const suffix = period === "morning" ? "صباحًا" : "مساءً";
    return `${h}:${m} ${suffix}`;
  }, [period]);

  return (
    <span className="tag mono text-ink-soft">
      {timeStr}
    </span>
  );
}

function HighlightLine({ text }: { text: string }) {
  if (!text.includes("الورد اليومي")) {
    return <span>{text}</span>;
  }

  const parts = text.split("الورد اليومي");
  return (
    <span>
      {parts[0]}
      <span
        className="font-semibold"
        style={{
          background: "linear-gradient(transparent 55%, rgba(245,222,114,.75) 55%)",
        }}
      >
        الورد اليومي
      </span>
      {parts[1]}
    </span>
  );
}

function RoleLine({ message }: { message: string }) {
  return (
    <div
      className="mt-3.5 flex items-start gap-2.5 rounded-[var(--r-sm)] p-3"
      style={{
        background: "rgba(245,222,114,0.16)",
        border: "1px solid rgba(226,201,92,0.45)",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 h-[17px] w-[17px] shrink-0"
        style={{ stroke: "var(--hl-yellow-ink)" }}
        aria-hidden
      >
        <path d="M22 10L12 5 2 10l10 5 10-5z" />
        <path d="M6 12v5c0 1.7 2.7 6 3s6-1.3 6-3v-5" />
      </svg>
      <span className="text-sm leading-[1.85] font-medium text-ink">
        {message}
      </span>
    </div>
  );
}