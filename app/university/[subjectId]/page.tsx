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
  const [resources, setResources] = useState<any[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!supabaseRef.current) supabaseRef.current = createClient();
      const supabase = supabaseRef.current;
      try {
        // Load subject (verified only)
        const { data: subjData } = await supabase
          .from("university_subjects")
          .select("id, name, name_en, code, type, source_url, university_id, department_id, academic_level_id, semester_id")
          .eq("id", params.subjectId)
          .maybeSingle();
        if (!cancelled) {
          setSubject(subjData || null);
          setError(subjData ? null : (locale === "ar" ? "المادة غير موجودة." : "Subject not found."));
        }

        // Load resources — ONLY published, with strict subject filter (no cross-context leak)
        if (subjData) {
          setResourcesLoading(true);
          try {
            const { data: resData, error: resErr } = await supabase
              .from("university_resources")
              .select("id, title, description, resource_type, url, storage_path, source_url, source_type, language, status, created_at, updated_at")
              .eq("university_subject_id", params.subjectId)
              .eq("status", "published")
              .order("updated_at", { ascending: false });
            if (!cancelled) {
              if (resErr) {
                setResourcesError(locale === "ar" ? "تعذر تحميل المصادر." : "Failed to load resources.");
              } else {
                setResources(resData || []);
                setResourcesError(null);
              }
            }
          } catch {
            if (!cancelled) setResourcesError(locale === "ar" ? "تعذر تحميل المصادر." : "Failed to load resources.");
          }
          if (!cancelled) setResourcesLoading(false);
        }
      } catch {
        if (!cancelled) setError(locale === "ar" ? "حدث خطأ." : "Error.");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [params.subjectId, locale]);

  const label = locale === "ar" ? (subject?.name || "المادة") : (subject?.name_en || subject?.name || "Subject");

  const t = (ar: string, en: string) => (locale === "ar" ? ar : en);

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
                  <p>
                    <a href={subject.source_url} target="_blank" rel="noopener noreferrer" className="underline text-ink">
                      {locale === "ar" ? "المصدر الرسمي للمادة" : "Official Subject Source"}
                    </a>
                  </p>
                )}
              </div>

              {/* Phase 2.7 — Academic Library Section */}
              <section aria-label={t("المكتبة الأكاديمية", "Academic Library")}>
                <div className="border-t border-rule pt-5 mt-2">
                  <h2 className="h3 mb-3">{t("المكتبة الأكاديمية — المصادر", "Academic Library — Resources")}</h2>
                  <p className="text-xs text-ink-soft mono mb-3">
                    {t("فقط المصادر المنشورة والموثوقة المرتبطة بهذه المادة.", "Only published, verified resources tied to this subject.")}
                  </p>

                  {resourcesLoading ? (
                    <div className="mono muted text-xs">{t("جارٍ تحميل المصادر…", "Loading resources…")}</div>
                  ) : resourcesError ? (
                    <div className="text-sm text-red-600">{resourcesError}</div>
                  ) : resources.length === 0 ? (
                    <div className="rounded-lg border border-rule bg-paper-2 p-4 text-xs text-ink-soft text-center">
                      <p className="font-semibold mb-1">{t("لا توجد مصادر مضافة لهذه المادة بعد.", "No resources available yet for this subject.")}</p>
                      <p className="mono">{t("عند إضافة مصادر موثوقة سيتم عرضها هنا فقط حسب سياق المادة.", "When verified sources are added, they will appear here — strictly filtered by subject context.")}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {resources.map((r: any) => (
                        <article key={r.id} className="rounded-xl border border-rule bg-paper-2 p-4 space-y-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold truncate">{r.title}</h3>
                              {r.description && <p className="text-xs text-ink-soft mt-0.5 line-clamp-2">{r.description}</p>}
                            </div>
                            <span className="text-[10px] mono uppercase tracking-wide text-ink-soft whitespace-nowrap px-1.5 py-0.5 rounded bg-paper border border-rule shrink-0">
                              {r.resource_type}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-soft mono">
                            <span>{r.language || "—"}</span>
                            <span>•</span>
                            <span>{r.source_type}</span>
                            <span>•</span>
                            <span>{new Date(r.updated_at).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US")}</span>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            {(r.url || r.storage_path) ? (
                              <a
                                href={r.url || r.storage_path}
                                target={r.url ? "_blank" : "_self"}
                                rel={r.url ? "noopener noreferrer" : undefined}
                                className="inline-flex items-center gap-1.5 text-xs font-medium underline hover:text-ink"
                              >
                                <span>🔗</span>
                                <span>{t("فتح المصدر", "Open Resource")}</span>
                              </a>
                            ) : null}
                            {r.source_url && (
                              <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] underline text-ink-soft hover:text-ink">
                                {t("المصدر", "Source")}
                              </a>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
