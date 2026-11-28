"use client";

import type { VideoCandidate } from "@/lib/lesson/video-server";

/* ==========================================================================
   طبقة التوصيات (§4.2) — تقسيم client-side رخيص للـ candidates لأربع أرفف.
   بدون AI في P1: مدة + كلمات مفتاحية في العنوان/الوصف فقط — مش نداء جديد.
   ========================================================================== */

function parseDurationMinutes(duration?: string): number | null {
  if (!duration) return null;
  // صيغ محتملة: "12:34" · "1:02:03" · "12 دقيقة" · "12 minutes"
  const hms = duration.match(/^(?:(\d+):)?(\d+):(\d+)$/);
  if (hms) {
    const h = Number(hms[1] ?? 0);
    const m = Number(hms[2]);
    return h * 60 + m;
  }
  const num = duration.match(/(\d+)/);
  if (num) {
    const n = Number(num[1]);
    if (/ساع|hour/i.test(duration)) return n * 60;
    return n;
  }
  return null;
}

const PRACTICAL_HINTS = [
  "تجرب", "تطبيق", "حل", "مسأل", "مثال", "تمرين", "مشروع", "شرح بالكود",
  "practical", "exercise", "example", "solved", "lab", "project",
];

function isPractical(c: VideoCandidate): boolean {
  const haystack = `${c.title ?? ""} ${c.reason ?? ""}`;
  return PRACTICAL_HINTS.some((hint) => haystack.toLowerCase().includes(hint));
}

export type VideoShelf = {
  id: "best" | "quick" | "deep" | "practical";
  label: string;
  hint: string;
  items: VideoCandidate[];
};

/** تقسيم الـ candidates لأربع أرفف — Best Match / Quick / Deep / Practical. */
export function buildVideoShelves(candidates: VideoCandidate[]): VideoShelf[] {
  if (candidates.length === 0) return [];
  const best = candidates[0];
  const rest = candidates.slice(1);

  const shelves: VideoShelf[] = [
    { id: "best", label: "الأكثر ملاءمة", hint: best.reason || "الأفضل للدرس", items: [best] },
    {
      id: "quick",
      label: "مراجعة سريعة",
      hint: "مدة ≤ 10 دقايق",
      items: rest.filter((c) => {
        const m = parseDurationMinutes(c.duration);
        return m !== null && m <= 10;
      }),
    },
    {
      id: "deep",
      label: "شرح عميق",
      hint: "مدة 30 دقيقة أو أكثر",
      items: rest.filter((c) => {
        const m = parseDurationMinutes(c.duration);
        return m !== null && m >= 30;
      }),
    },
    {
      id: "practical",
      label: "تطبيقي",
      hint: "أمثلة وحل مسائل",
      items: rest.filter((c) => isPractical(c)),
    },
  ];
  return shelves.filter((shelf) => shelf.items.length > 0);
}

export default function VideoRecommendations({
  candidates,
  activeId,
  onSelect,
  onDismiss,
}: {
  candidates: VideoCandidate[];
  activeId?: string | null;
  onSelect: (candidate: VideoCandidate) => void;
  /** «مش مناسب» — إخفاء الترشيح في الجلسة الحالية (P2 مطلب 3). */
  onDismiss?: (id: string) => void;
}) {
  const shelves = buildVideoShelves(candidates);
  if (shelves.length === 0) {
    return (
      <div className="rounded-xl border border-rule bg-paper-2 p-3.5 text-center" dir="rtl">
        <p className="text-[11.5px] text-ink-soft leading-relaxed">
          مفيش فيديوهات مقترحة مناسبة للدرس دلوقتي — استخدم البحث اليدوي فوق لتلاقي الفيديو المناسب بنفسك.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {shelves.map((shelf) => (
        <div key={shelf.id}>
          <div className="flex items-baseline gap-2 mb-1.5">
            <h4 className="text-[13px] font-bold text-ink">{shelf.label}</h4>
            <span className="text-[11px] text-ink-soft">{shelf.hint}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {shelf.items.map((c) => (
              <div
                key={shelf.id + c.id}
                className={`shrink-0 w-44 text-right rounded-xl border p-2.5 transition ${
                  activeId === c.id
                    ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                    : "border-[var(--border)] bg-[var(--card-secondary)] hover:border-[var(--accent)]"
                }`}
              >
                {/* 🎬 اختيار الفيديو */}
                <button onClick={() => onSelect(c)} aria-pressed={activeId === c.id} className="block w-full text-right">
                  <span className="block text-[11.5px] font-bold text-ink line-clamp-2 leading-snug">{c.title || "فيديو"}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-soft">
                    {c.duration && <span className="ltr-num tnum">⏱ {c.duration}</span>}
                    {c.channel && <span className="truncate max-w-[7rem]">{c.channel}</span>}
                  </span>
                </button>
                {/* «ليه اتيرشح» — سبب الترشيح ظاهر لكل فيديو (P2 مطلب 3) */}
                {c.reason && (
                  <p className="mt-1.5 text-[9.5px] leading-snug text-ink-soft" title={c.reason}>
                    💡 {c.reason}
                  </p>
                )}
                {onDismiss && (
                  <button
                    type="button"
                    onClick={() => onDismiss(c.id)}
                    className="mt-1.5 text-[9.5px] text-ink-soft hover:text-redpen transition"
                    title="إخفاء الترشيح ده في الجلسة الحالية"
                  >
                    ✕ مش مناسب
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
