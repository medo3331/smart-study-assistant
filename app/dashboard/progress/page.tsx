"use client";

import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertTriangle, Check, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CurriculumCoverageCard, ExamCountdown } from "@/components/CurriculumCoverageCard";
import type { CoverageBreakdown } from "@/lib/curriculum-coverage";

/* ============================================================================
   Phase 1.3 — Curriculum Coverage + Exam Countdown Dashboard Integration
   - Reads from server endpoint (deterministic; not client-submitted)
   - Displays real values only; never shows 0% when there is no data
   - Shows setup state when academic context is missing (no guessing)
   - Preserves existing Study Plan (does not delete planner_goals)
 ============================================================================ */

export default function CurriculumProgressPage() {
  const [supabase] = useState(() => createClient());
  const [coverage, setCoverage] = useState<CoverageBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  const loadCoverage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/curriculum-coverage");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "خطأ في تحميل التغطية.");
        setCoverage(null);
      } else {
        setCoverage(json.data);
        setError(null);
      }
      setLastRefresh(new Date().toLocaleTimeString("ar-EG"));
    } catch (err: any) {
      setError(err?.message || "فشل الاتصال بالخادم.");
      setCoverage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCoverage();
  }, [loadCoverage]);

  // Study Plan preservation message
  return (
    <main className="min-h-screen bg-[#fdfbf7] text-[#2a2320]" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <header className="mb-8">
          <nav className="flex items-center gap-2 text-xs text-stone-400 mb-4" aria-label="مسار التنقل">
            <a href="/dashboard" className="hover:text-stone-600">الرئيسية</a>
            <span>/</span>
            <span className="text-stone-600">تقدم المنهج</span>
          </nav>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#2a2320] leading-tight tracking-tight">تقدم المنهج</h1>
          <p className="text-sm text-stone-500 mt-2">تغطية المحتوى الدراسي بناءً على إكمال الدروس الفعلي فقط.</p>
        </header>

        {/* Coverage Card */}
        <section aria-label="قسم التغطية" className="mb-6">
          <CurriculumCoverageCard
            coverage={coverage}
            loading={loading}
            error={error}
            onRefresh={loadCoverage}
          />
        </section>

        {/* Additional details: coverage states explanation */}
        <section aria-label="شرح حالات التغطية" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm mb-6">
          <h2 className="text-sm font-extrabold text-[#2a2320] mb-3">حالات التغطية</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StateCard label="لا توجد بيانات" desc="لم يتم ربط أي محتوى منهجي بعد." color="text-stone-400" />
            <StateCard label="ربط جزئي" desc="بعض المحتوى مرتبط؛ التغطية مبنية على المرتبط فقط." color="text-amber-600" />
            <StateCard label="نشط" desc="تقدم مستمر — هناك دروس مرتبطة ومكتملة." color="text-emerald-700" />
            <StateCard label="مكتمل" desc="تم إكمال جميع الدروس المرتبطة." color="text-emerald-700" />
          </div>
        </section>

        {/* Security & verification note */}
        <section aria-label="ملاحظات الأمان" className="rounded-xl bg-stone-50 border border-stone-200 p-4 text-xs text-stone-500 leading-relaxed">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold text-stone-700 mb-1">مصدر الحقيقة: إكمال الدروس الفعلي</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>التغطية تُحسب من <strong>الدروس المرتبطة فعليًا</strong> فقط.</li>
                <li>إكمال درس = <strong>إكمال يوم دراسي فعلي</strong> (عبر نظام الإكمال الموثوق).</li>
                <li>إنشاء عنصر في المخطط أو فتح درس <strong>لا يُحسب</strong> كإكمال.</li>
                <li>لا يتم قبول نسب مغطاة من العميل — الحساب يتم من الخادم فقط.</li>
                <li>بيانات المخطط الحالي <strong>محفوظة</strong> — لا يتم حذف أي مهام.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Isolation note */}
        <section className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800" aria-label="تنبيه عزل المنهج">
          <strong>عزل المنهج:</strong> التغطية والامتحانات معزولة تمامًا بين <span className="font-bold">الثانوية العامة</span> و<span className="font-bold">البكالوريا المصرية</span>. نفس اسم المادة لا يعني نفس المنهج.
        </section>
      </div>
    </main>
  );
}

function StateCard({ label, desc, color }: { label: string; desc: string; color: string }) {
  return (
    <div className="rounded-xl bg-white border border-stone-200 p-3 shadow-sm">
      <h4 className={`text-xs font-extrabold mb-1 ${color}`}>{label}</h4>
      <p className="text-[10px] text-stone-500 leading-snug">{desc}</p>
    </div>
  );
}
