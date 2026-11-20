"use client";

// components/engagement/SmartNotesDiscoveryCard.tsx
//
// P1-B2.2 — كارت اكتشاف Smart Notes.
//
// 📌 **السلوك**:
//   • `undiscovered` : كارت تعريف بسيط بسؤال + زر "اكتب نوتة" (وده بيسجّل
//                        "تعرّفت" بعد أول عرض فعلي).
//   • `introduced`   : ماينعرضش تاني — الطالب عرف.
//   • `tried`        : نعرض تلميح تطوير (مش تعريف مكرر).
//   • `adopted`      : نعرض Tips/استخدامات متقدمة، ومن غير أي إزعاج.
//
// ⚠️ **مش إجبار**: الكارت بيختفي تمامًا بعد 3 تجاهلات، ومفيش قفل على الميزة.
// ⚠️ ممنوع في هذه المرحلة: Coins، XP، Missions، Push.

import React from "react";
import Link from "next/link";
import { NotebookPen, X } from "lucide-react";

type DiscoveryState = "undiscovered" | "introduced" | "tried" | "adopted";

type Decision = {
  shouldIntroduce: boolean;
  showIntro: boolean;
  showTip: boolean;
  reason: string;
};

type DiscoveryResponse = {
  feature: string;
  state: DiscoveryState;
  availability: string;
  label: string;
  route: string | null;
  dismissCount: number;
  decision: Decision;
  copy: { intro: string | null; tip: string | null };
};

const DISMISS_KEY = "engagement:smart_notes:dismissed";

/** عرض الكارت. */
export default function SmartNotesDiscoveryCard() {
  const [data, setData] = React.useState<DiscoveryResponse | null>(null);
  const [hidden, setHidden] = React.useState(true);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/engagement/discovery?feature=smart_notes", {
          method: "GET",
          headers: { accept: "application/json" },
        });
        if (!response.ok) return;
        const payload = (await response.json()) as DiscoveryResponse;
        if (cancelled) return;

        const localDismissed = Number(
          typeof window !== "undefined" ? window.localStorage.getItem(DISMISS_KEY) ?? "0" : "0",
        );
        const totalDismissed = payload.dismissCount + localDismissed;

        setData(payload);
        const showable =
          payload.decision.showIntro ||
          payload.decision.showTip ||
          (payload.decision.shouldIntroduce && totalDismissed < 3);
        setHidden(!showable);
      } catch {
        // الكارت ثانوي — فشله مايأثرش على الصفحة.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** تسجيل التعريف (introduced) بعد أول عرض حقيقي. */
  const markIntroduced = React.useCallback(() => {
    void fetch("/api/engagement/discovery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feature: "smart_notes", surface: "dashboard", action: "introduce" }),
    }).catch(() => undefined);
  }, []);

  const dismiss = React.useCallback(() => {
    setHidden(true);
    try {
      const next = Number(window.localStorage.getItem(DISMISS_KEY) ?? "0") + 1;
      window.localStorage.setItem(DISMISS_KEY, String(next));
    } catch {
      // localStorage مش متاح — نتجاهل.
    }
  }, []);

  if (!mounted || hidden || !data) return null;

  const ctaHref = data.route ?? "/notes";
  const isTip = data.decision.showTip && !data.decision.showIntro;
  const body = isTip ? data.copy.tip : data.copy.intro;

  if (!body) return null;

  return (
    <section
      className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30"
      aria-label="اقتراح ميزة"
      data-discovery-state={data.state}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-xl bg-emerald-600/10 p-2 text-emerald-700 dark:text-emerald-300">
          <NotebookPen className="h-5 w-5" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            {data.label}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-emerald-900/80 dark:text-emerald-100/80">
            {body}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={ctaHref}
              onClick={markIntroduced}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-800"
            >
              {isTip ? "افتح النوتس" : "اكتب نوتة"}
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-2 py-1.5 text-sm text-emerald-900/70 transition hover:bg-emerald-900/10 dark:text-emerald-100/70"
            >
              مش دلوقتي
            </button>
          </div>
        </div>

        <button
          type="button"
          aria-label="إخفاء الاقتراح"
          onClick={dismiss}
          className="rounded-lg p-1 text-emerald-900/50 transition hover:bg-emerald-900/10 dark:text-emerald-100/50"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}
