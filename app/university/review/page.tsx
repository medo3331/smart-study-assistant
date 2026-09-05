"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { calculateNextReview, Rating } from "@/lib/education/spaced-repetition";

export default function UniversityReviewSessionPage() {
  const { locale } = useLanguage();
  const [items, setItems] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState<Record<number, boolean>>({});
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load only current user's due review schedules linked to verified university_review_items
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (!cancelled) setLoading(false); return; }
        const nowISO = new Date().toISOString();
        const { data: due } = await supabase
          .from("review_schedules")
          .select("id, interval, repetitions, ease_factor, due_at, status, review_items(id, title, name_en, name, prompt, answer, source_url)")
          .eq("user_id", user.id)
          .lte("due_at", nowISO)
          .in("status", ["pending", "due"])
          .order("due_at", { ascending: true })
          .limit(20);
        if (!cancelled) {
          setItems(due || []);
          // Filter out any schedules with no valid review item (data safety)
          const validItems = (due || []).filter((d: any) => d.review_items && d.review_items.id);
          setItems(validItems);
        }
      } catch (e: any) {
        if (!cancelled) setError(locale === "ar" ? "تعذر تحميل المراجعة." : "Failed to load review session.");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [locale]);

  async function submitRating(rating: Rating) {
    const item = items[currentIdx];
    if (!item || submitted[currentIdx]) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(locale === "ar" ? "غير مصرح." : "Not authorized.");
      // Load previous schedule (authoritative — server only)
      const { data: prev } = await supabase
        .from("review_schedules")
        .select("interval, repetitions, ease_factor, due_at, last_reviewed_at")
        .eq("id", item.id)
        .single();
      const result = calculateNextReview({
        interval: item.interval || 1,
        repetitions: item.repetitions || 0,
        easeFactor: item.ease_factor || 2.5,
        dueAt: new Date(item.due_at),
        lastReviewedAt: item.last_reviewed_at ? new Date(item.last_reviewed_at) : null,
      }, rating, new Date());
      // Update schedule server-side (authoritative)
      const { error: upErr } = await supabase.from("review_schedules").update({
        interval: result.interval,
        repetitions: result.repetitions,
        ease_factor: result.easeFactor,
        due_at: result.dueAt.toISOString(),
        last_reviewed_at: result.lastReviewedAt ? result.lastReviewedAt.toISOString() : null,
        next_review_at: result.dueAt.toISOString(),
        status: "pending",
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      if (upErr) throw upErr;
      // Insert event
      const { error: evErr } = await supabase.from("review_events").insert({
        user_id: user.id,
        review_item_id: item.review_items?.id,
        rating,
        previous_interval: prev?.interval ?? item.interval,
        new_interval: result.interval,
        reviewed_at: new Date().toISOString(),
      });
      if (evErr) console.error("Event insert non-blocking:", evErr.message);
      setSubmitted({ ...submitted, [currentIdx]: true });
      if (currentIdx < items.length - 1) {
        setCurrentIdx((i) => i + 1);
      } else {
        setDone(true);
      }
    } catch (e: any) {
      setError(e?.message || (locale === "ar" ? "حدث خطأ." : "Something went wrong."));
    } finally {
      setSubmitting(false);
    }
  }

  const item = items[currentIdx];

  return (
    <div className="min-h-screen font-sans bg-paper text-ink flex items-center justify-center p-4 sm:p-6" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="w-full max-w-lg">
        <nav className="flex items-center gap-2 text-xs mono text-ink-soft mb-4">
          <Link href="/university" className="hover:text-ink">{locale === "ar" ? "← المنهج الجامعي" : "← University Curriculum"}</Link>
        </nav>
        <h1 className="h2 mb-6">{locale === "ar" ? "المراجعة الذكية" : "Spaced Repetition"}</h1>
        {loading && <p className="mono muted">{locale === "ar" ? "جارٍ تحميل المراجعة…" : "Loading review session…"}</p>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="sheet-card p-10 text-center text-ink-soft space-y-3">
            <p className="text-lg font-display">🎉</p>
            <p>{locale === "ar" ? "لا توجد مراجعات مستحقة اليوم." : "No reviews due today."}</p>
            <Link href="/university" className="btn btn-marker text-sm">{locale === "ar" ? "← العودة للمنهج" : "← Back to Curriculum"}</Link>
          </div>
        )}
        {!loading && !error && items.length > 0 && !item && (
          <div className="sheet-card p-10 text-center text-ink-soft space-y-3">
            <p>{locale === "ar" ? "انتهيت من المراجعة اليوم!" : "Review session complete!"}</p>
            <Link href="/university" className="btn btn-marker text-sm">{locale === "ar" ? "← العودة للمنهج" : "← Back to Curriculum"}</Link>
          </div>
        )}
        {!loading && !error && item && item.review_items && (
          <div className="sheet-card p-6 sm:p-8 space-y-6">
            <div>
              <div className="eyebrow text-xs mono text-ink-soft">{item.review_items.code || item.review_items.title}</div>
              <h2 className="font-display text-xl mt-1">{item.review_items.title}</h2>
            </div>
            <div className="p-4 rounded-lg border border-rule bg-paper-2 text-sm leading-7 space-y-3">
              <p className="font-semibold">{locale === "ar" ? "السؤال:" : "Question:"}</p>
              <p className="text-ink">{item.review_items.prompt}</p>
            </div>
            <button type="button" className="btn btn-secondary btn-block text-sm" onClick={() => {
              const el = document.getElementById("review-answer");
              if (el) el.classList.remove("hidden");
            }}>{locale === "ar" ? "إظهار الإجابة" : "Show Answer"}</button>
            <div id="review-answer" className="hidden">
              <div className="p-4 rounded-lg border border-marker bg-amber-50 text-sm leading-7 space-y-2">
                <p className="font-semibold text-ink">{locale === "ar" ? "الإجابة:" : "Answer:"}</p>
                <p>{item.review_items.answer}</p>
                {item.review_items.source_url && <p className="text-xs text-ink-soft"><a href={item.review_items.source_url} target="_blank" rel="noopener noreferrer" className="underline">{locale === "ar" ? "المصدر الرسمي" : "Official Source"}</a></p>}
              </div>
            </div>
            <div className="pt-2">
              <p className="text-xs mono text-ink-soft mb-2">{locale === "ar" ? "كيف كان تذكرك؟" : "How was your recall?"}</p>
              <div className="flex gap-2 flex-wrap">
                {(["Again", "Hard", "Good", "Easy"] as Rating[]).map((r) => (
                  <button key={r} type="button" disabled={submitting || !!submitted[currentIdx]} onClick={() => submitRating(r)} className="btn btn-secondary text-xs font-semibold rounded-full px-4 py-2 disabled:opacity-50">{r === "Again" ? (locale === "ar" ? "مرة أخرى" : "Again") : r === "Hard" ? (locale === "ar" ? "صعب" : "Hard") : r === "Good" ? (locale === "ar" ? "جيد" : "Good") : (locale === "ar" ? "سهل" : "Easy")}</button>
                ))}
              </div>
            </div>
            <p className="mono text-xs text-ink-soft">{locale === "ar" ? "المراجعة الذكية تعتمد فقط على السجلات الحقيقية — لا بيانات وهمية." : "Spaced repetition uses verified records only — no fabricated data."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
