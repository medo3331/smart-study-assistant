"use client";

import { ReligiousChat } from "@/components/worship/ReligiousChat";
import {
  WorshipChrome,
  useSharedWorshipData,
  useWorshipReward,
} from "@/components/worship/WorshipChrome";
import { Reveal } from "@/components/ui/Reveal";
import Link from "next/link";
import { ArrowLeft, MessagesSquare } from "lucide-react";

/**
 * Quiz Page — /worship/quiz
 *
 * شات ديني تفاعلي: المستخدم بيسأل عن مواضيعه الدينية والمساعد بيجاوب
 * بمصادر موثوقة (آيات بأسماء السور وأرقامها، أحاديث من الصحيحين والكتب
 * الستة — بدون أحاديث ضعيفة أو خلافات فقهية) وبيتفاعل معاه ويسأله.
 * جوه الشات زرار «اختبرني»: ١٠ أسئلة من بنك الأسئلة الجاهز (db/123)
 * بتصحيح سيرفري، وخلاصة الجولة تكسب ١٠ كوينز من مصدر worship_quiz
 * (db/120/121 — التصحيح والصرف سيرفري)، مع لوحة ترتيب أسبوعية.
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
              شات مساعد ديني بيجاوبك ويسألك — واكسب كوينز من «اختبرني»
            </p>
          </div>
          <Link href="/worship" className={backLinkClass}>
            <ArrowLeft size={18} aria-hidden />
            <span>عباداتي</span>
          </Link>
        </div>
      </Reveal>

      {/* الشات + المسابقات */}
      <Reveal index={1}>
        {shared ? (
          <ReligiousChat
            supabase={shared.supabase}
            signedIn={signedIn}
            userId={shared.user?.id ?? null}
            onCoins={(coins) => showReward(coins, "أسئلة دينية")}
          />
        ) : null}
      </Reveal>

      {/* Info Card */}
      <Reveal index={2}>
        <div className="flex items-start gap-4 rounded-[24px] border border-white/[0.06] bg-[#0D1029]/70 p-6">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#10B981]/15 text-[#6EE7B7]">
            <MessagesSquare size={24} aria-hidden />
          </div>
          <div>
            <h3 className="mb-2 text-lg font-bold text-white">عن الشات</h3>
            <p className="leading-relaxed text-[#C7CBE6]">
              اسأل عن أي موضوع ديني والمساعد بيجاوبك بمصادر موثوقة فقط: آيات
              قرآنية بأسماء السور وأرقام الآيات، وأحاديث من الصحيحين والكتب
              الستة بأرقامها — بدون أحاديث ضعيفة وبدون خلافات فقهية، ولو
              معاهوش مصدر موثوق بيقولها «معلومة عامة». وفي وضع «اختبرني»
              بيسألك ١٠ أسئلة جوّه الشات ويصححلك ويسأل اللي بعده، وبعد
              الخلاصة تكسب ١٠ كوينز (حتى مرتين في اليوم).
            </p>
          </div>
        </div>
      </Reveal>
    </>
  );
}

const backLinkClass =
  "flex items-center gap-1 text-sm text-[#6EE7B7] transition-colors hover:text-[#10B981]";
