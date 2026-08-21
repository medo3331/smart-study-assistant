"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { INTERESTS, type InterestId, type StylePreference } from "@/lib/shop/personalization";

type Props = {
  busy?: boolean;
  onSave: (interests: InterestId[], style: StylePreference) => Promise<void>;
  onSkip: () => Promise<void>;
};

export function InterestOnboarding({ busy = false, onSave, onSkip }: Props) {
  const [selected, setSelected] = useState<InterestId[]>([]);
  const [style, setStyle] = useState<StylePreference>(null);

  const toggle = (id: InterestId) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <section className="sheet-card p-5 sm:p-7 space-y-5 border-2 border-rule-strong" aria-labelledby="interests-title">
      <div className="flex gap-3 items-start">
        <span className="w-10 h-10 rounded-full bg-paper-3 grid place-items-center text-lg shrink-0" aria-hidden><Sparkles className="w-5 h-5" /></span>
        <div>
          <p className="eyebrow eyebrow-flush mb-1">خلّي المتجر شبهك</p>
          <h2 id="interests-title" className="h3">إيه اللي بتحبه؟</h2>
          <p className="text-sm text-ink-soft mt-1">اختياراتك ترتّب المقترحات بس، وتقدر تغيّرها بعدين. مش لازم تختار نوع أو ستايل.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="الاهتمامات">
        {INTERESTS.map((interest) => {
          const active = selected.includes(interest.id);
          return <button key={interest.id} type="button" onClick={() => toggle(interest.id)} aria-pressed={active} className={`text-sm px-3 py-2 rounded-full border transition ${active ? "bg-ink text-paper-2 border-ink" : "bg-paper-2 border-rule text-ink hover:border-rule-strong"}`}>
            <span aria-hidden>{interest.icon}</span> {interest.label} {active && <Check className="inline w-3.5 h-3.5 ms-1" aria-hidden />}
          </button>;
        })}
      </div>

      <fieldset className="space-y-2">
        <legend className="tag">تفضيل شكلي اختياري</legend>
        <div className="flex flex-wrap gap-2">
          {([ ["calm", "هادئ"], ["bold", "جريء"], ["minimal", "بسيط"] ] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setStyle(style === id ? null : id)} aria-pressed={style === id} className={`text-sm px-3 py-2 rounded-[var(--r-sm)] border ${style === id ? "border-ink bg-paper-3" : "border-rule bg-paper-2 text-ink-soft"}`}>{label}</button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} onClick={() => void onSave(selected, style)} className="btn btn-marker text-sm">{busy ? "بيتحفظ…" : "اختار المقترحات"}</button>
        <button disabled={busy} onClick={() => void onSkip()} className="btn btn-quiet text-sm">تخطّي دلوقتي</button>
      </div>
    </section>
  );
}
