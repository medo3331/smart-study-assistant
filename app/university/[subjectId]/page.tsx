"use client";
import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import Link from "next/link";

export default function UniversitySubjectPage({ params }: { params: { subjectId: string } }) {
  const router = useRouter();
  const { locale } = useLanguage();
  const [subject, setSubject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!supabaseRef.current) supabaseRef.current = createClient();
      const supabase = supabaseRef.current;
      try {
        const { data } = await supabase.from("university_subjects").select("id, name, name_en, code, type, source_url").eq("id", params.subjectId).maybeSingle();
        if (!cancelled) { setSubject(data || null); setError(data ? null : (locale === "ar" ? "المادة غير موجودة." : "Subject not found.")); }
      } catch { if (!cancelled) setError(locale === "ar" ? "حدث خطأ." : "Error."); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [params.subjectId, locale]);

  const label = locale === "ar" ? (subject?.name || "المادة") : (subject?.name_en || subject?.name || "Subject");

  return (
    <div className="min-h-screen font-sans bg-paper text-ink flex items-center justify-center p-4 sm:p-6" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="w-full max-w-lg">
        <Link href="/university" className="mono text-xs text-ink-soft hover:text-ink">← {locale === "ar" ? "المنهج الجامعي" : "University Curriculum"}</Link>
        <div className="sheet-card p-6 sm:p-8 space-y-5 mt-4">
          {loading && <p className="mono muted">{locale === "ar" ? "جارٍ التحميل…" : "Loading…"}</p>}
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          {subject && (
            <>
              <h1 className="h2">{label}</h1>
              <div className="mono text-xs text-ink-soft">{subject.code} {subject.type ? `• ${subject.type}` : ""}</div>
              <div className="space-y-2 text-sm text-ink-soft">
                <p>{locale === "ar" ? "محتوى المادة سيظهر هنا عند إضافة وحدات المنهج." : "Subject content will appear when curriculum units are added."}</p>
                {subject.source_url && (
                  <p><a href={subject.source_url} target="_blank" rel="noopener noreferrer" className="underline text-ink">{locale === "ar" ? "المصدر الرسمي" : "Official Source"}</a></p>
                )}
              </div>
              <div className="p-3 rounded-lg border border-rule bg-paper-2 text-xs mono text-ink-soft">{locale === "ar" ? "هذا مكان واضح لإضافة المنهج القادم." : "Placeholder for upcoming curriculum content."}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
