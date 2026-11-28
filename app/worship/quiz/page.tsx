"use client";

import { QuizGame } from "@/components/worship/QuizGame";
import {
  WorshipChrome,
  useSharedWorshipData,
  useWorshipReward,
} from "@/components/worship/WorshipChrome";
import { Reveal } from "@/components/ui/Reveal";
import Link from "next/link";
import { ArrowLeft, Brain } from "lucide-react";

/**
 * Quiz Page — /worship/quiz
 *
 * الأسئلة الدينية والمسابقات: AI يولّد ١٠ أسئلة من مصادر موثوقة (قرآن/حديث
 * بأرقام معروفة — بدون أحاديث ضعيفة أو خلافات فقهية)، وإتمام الجلسة يكسب
 * ١٠ كوينز من مصدر worship_quiz (db/120 — التصحيح والصرف سيرفري)، مع لوحة
 * ترتيب أسبوعية.
 */
export default function QuizPage() {
  return (
    <WorshipChrome>
      <QuizHome />
    </WorshipChrome>
  );
}

function QuizHome() {
  const shared = useSharedWorshipData();
  const { showReward } = useWorshipReward();

  const signedIn = Boolean(shared?.user) && !shared?.user?.is_anonymous;

  return (
    <>
      {/* Header */}
      <Reveal index={0}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">الأسئلة الدينية</h1>
            <p className="mt-1 text-[#9AA0C0]">
              ١٠ أسئلة اختيار من متعدد من القرآن والحديث الشريف — واكسب كوينز
            </p>
          </div>
          <Link href="/worship" className={backLinkClass}>
            <ArrowLeft size={18} aria-hidden />
            <span>عباداتي</span>
          </Link>
        </div>
      </Reveal>

      {/* اللعبة + المسابقات */}
      <Reveal index={1}>
        {shared ? (
          <QuizGame
            supabase={shared.supabase}
            signedIn={signedIn}
            onCoins={(coins) => showReward(coins, "أسئلة دينية")}
          />
        ) : null}
      </Reveal>

      {/* Info Card */}
      <Reveal index={2}>
        <div className="flex items-start gap-4 rounded-[24px] border border-white/[0.06] bg-[#0D1029]/70 p-6">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#10B981]/15 text-[#6EE7B7]">
            <Brain size={24} aria-hidden />
          </div>
          <div>
            <h3 className="mb-2 text-lg font-bold text-white">عن الأسئلة</h3>
            <p className="leading-relaxed text-[#C7CBE6]">
              الأسئلة بتتولّد من مصادر موثوقة فقط: آيات قرآنية بأسماء السور
              وأرقام الآيات، وأحاديث من الصحيحين والكتب الستة بأرقامها —
              بدون أحاديث ضعيفة وبدون خلافات فقهية بين المذاهب. كمّل الـ ١٠
              أسئلة وتكسب ١٠ كوينز (حتى مرتين في اليوم)، وأعلى نتائجك تظهر في
              مسابقات الأسبوع.
            </p>
          </div>
        </div>
      </Reveal>
    </>
  );
}

const backLinkClass =
  "flex items-center gap-1 text-sm text-[#6EE7B7] transition-colors hover:text-[#10B981]";
