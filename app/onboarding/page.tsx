"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { TopControls } from "@/components/TopControls";
import { BrandLock } from "@/components/BrandLogo";
import {
  ROLE_HOMES,
  personaToRole,
  roleHome,
  safeNext,
} from "@/lib/auth-roles";

type Role = "student" | "graduate" | "freelancer";
type StepKey = "role" | "stage" | "grade" | "track" | "done";

/* Canonical taxonomy records read from DB — not hardcoded names */
interface StageRow { id: string; name: string; code: string; order_index: number };
interface GradeRow { id: string; stage_id: string; name: string; code: string; order_index: number };
interface TrackRow { id: string; stage_id: string; grade_id: string | null; name: string; code: string };

function currentNext(): string {
  if (typeof window === "undefined") return "";
  return safeNext(new URLSearchParams(window.location.search).get("next"), "");
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const { t, locale } = useLanguage();

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<Role>("student");
  const [step, setStep] = useState<StepKey>("role");

  /* Taxonomy state */
  const [stages, setStages] = useState<StageRow[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [stageId, setStageId] = useState<string | null>(null);
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);

  const [loadingTax, setLoadingTax] = useState(false);

  /* University student sub-type (from PersonaPicker) */
  const [studentType, setStudentType] = useState<"school" | "university" | null>(null);
  const [universityId, setUniversityId] = useState<string | null>(null);
  const [facultyId, setFacultyId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [academicLevelId, setAcademicLevelId] = useState<string | null>(null);
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [uniData, setUniData] = useState<{ universities: any[]; faculties: any[]; departments: any[]; levels: any[]; semesters: any[] }>({ universities: [], faculties: [], departments: [], levels: [], semesters: [] });
  const [uniLoading, setUniLoading] = useState(false);

  /* ---- Read pending student type from PersonaPicker ---- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem('pendingStudentType');
    if (raw === 'university') setStudentType('university');
    else if (raw === 'school') setStudentType('school');
    if (raw === 'university') {
      setUniversityId(window.localStorage.getItem('pendingUniversityId') || null);
      setFacultyId(window.localStorage.getItem('pendingFacultyId') || null);
      setDepartmentId(window.localStorage.getItem('pendingDepartmentId') || null);
      setAcademicLevelId(window.localStorage.getItem('pendingAcademicLevelId') || null);
      setSemesterId(window.localStorage.getItem('pendingSemesterId') || null);
    }
  }, []);

  /* ---- Load university taxonomy (once, when university student) ---- */
  useEffect(() => {
    if (studentType !== 'university' || universityId) return;
    void (async () => {
      try {
        if (!supabaseRef.current) supabaseRef.current = createClient();
        const supabase = supabaseRef.current;
        const [{ data: univ }, { data: fac }, { data: dept }, { data: lvl }, { data: sem }] = await Promise.all([
          supabase.from('universities').select('id, name, code').order('name'),
          supabase.from('university_faculties').select('id, name, code, university_id').order('name'),
          supabase.from('university_departments').select('id, name, code, faculty_id').order('name'),
          supabase.from('university_levels').select('id, name, code, order_index').order('order_index'),
          supabase.from('university_semesters').select('id, name, code').order('name'),
        ]);
        const uData = { universities: univ || [], faculties: fac || [], departments: dept || [], levels: lvl || [], semesters: sem || [] };
        setUniData(uData);
        // If there's a pre-selected university from localStorage, use it; else default to first
        const preUni = typeof window !== 'undefined' ? window.localStorage.getItem('pendingUniversityId') || null : null;
        const firstUniId = (univ && univ[0]) ? univ[0].id : null;
        setUniversityId(preUni || firstUniId);
      } catch { /* silent */ }
    })();
  }, [studentType]);

  /* ---- Auth guard + existing profile read ---- */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!supabaseRef.current) supabaseRef.current = createClient();
      const supabase = supabaseRef.current;
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!cancelled && (!user || user.is_anonymous)) {
        router.replace("/welcome");
        return;
      }
      if (!cancelled && user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("persona, onboarded_at, education_stage_id, education_grade_id, education_track_id")
          .eq("id", user.id)
          .maybeSingle();

        if (!cancelled && profile?.onboarded_at) {
          const doneRole = personaToRole(profile.persona);
          router.replace(doneRole ? roleHome(doneRole) : "/dashboard");
          return;
        }
        if (!cancelled) {
          const existing = personaToRole(profile?.persona);
          if (existing) {
            setRole(existing);
            /* If previous onboarding partial (e.g., role saved but stage not), resume from stage for students */
            const stageSet = !!profile?.education_stage_id;
            const gradeSet = !!profile?.education_grade_id;
            if (existing === "student" && stageSet && !gradeSet) {
              setStageId(profile.education_stage_id || null);
              setStep("grade");
            } else if (existing === "student" && stageSet && gradeSet) {
              setStageId(profile.education_stage_id || null);
              setGradeId(profile.education_grade_id || null);
              setStep("track");
            } else {
              setStep(existing === "student" ? "stage" : "done");
            }
          }
        }
      }
      if (!cancelled) setChecking(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Load stages (once) ---- */
  useEffect(() => {
    if (stages.length > 0) return;
    void (async () => {
      setLoadingTax(true);
      try {
        if (!supabaseRef.current) supabaseRef.current = createClient();
        const supabase = supabaseRef.current;
        const { data } = await supabase
          .from("education_stages")
          .select("id, name, code, order_index")
          .order("order_index", { ascending: true });
        if (data) setStages(data as StageRow[]);
      } catch { /* silent — UI shows empty, retry via back/edit allowed */ }
      setLoadingTax(false);
    })();
  }, [stages.length]);

  /* ---- Load grades when stage selected ---- */
  useEffect(() => {
    if (!stageId) { setGrades([]); setGradeId(null); return; }
    void (async () => {
      setLoadingTax(true);
      try {
        if (!supabaseRef.current) supabaseRef.current = createClient();
        const supabase = supabaseRef.current;
        const { data } = await supabase
          .from("education_grades")
          .select("id, stage_id, name, code, order_index")
          .eq("stage_id", stageId)
          .order("order_index", { ascending: true });
        if (data) setGrades(data as GradeRow[]);
      } catch {}
      setLoadingTax(false);
    })();
  }, [stageId]);

  /* ---- Load tracks when Baccalaureate stage + grade selected ---- */
  const loadTracks = useCallback(async () => {
    if (!stageId || !gradeId) { setTracks([]); return; }
    /* Only show tracks for Baccalaureate; guard via stage code read from stage row */
    const stage = stages.find((s) => s.id === stageId);
    if (!stage || stage.code !== "BACCALAUREATE") { setTracks([]); setTrackId(null); return; }
    setLoadingTax(true);
    try {
      if (!supabaseRef.current) supabaseRef.current = createClient();
      const supabase = supabaseRef.current;
      const { data } = await supabase
        .from("education_tracks")
        .select("id, stage_id, grade_id, name, code")
        .eq("stage_id", stageId)
        .order("name", { ascending: true });
      /* Prefer tracks linked to selected grade; if none linked, show all for stage */
      let filtered = (data || []) as TrackRow[];
      const linked = filtered.filter((t) => t.grade_id === gradeId);
      if (linked.length > 0) filtered = linked;
      setTracks(filtered);
    } catch {}
    setLoadingTax(false);
  }, [stageId, gradeId, stages]);

  useEffect(() => {
    if (step === "track") loadTracks();
  }, [step, loadTracks]);

  /* ---- Persist (server-side) ---- */
  async function persist(data: {
    persona: "student" | "grad" | "freelancer";
    studentType?: "school" | "university" | null;
    stageId?: string | null;
    gradeId?: string | null;
    trackId?: string | null;
    universityId?: string | null;
    facultyId?: string | null;
    departmentId?: string | null;
    academicLevelId?: string | null;
    semesterId?: string | null;
    onboardedAtIso: string;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return { ok: false, error: locale === "ar" ? "غير مصرح." : "Not authorized." };

    /* Server-side validation: role must match allowed set */
    const allowedPersona: string[] = ["student", "grad", "freelancer"];
    if (!allowedPersona.includes(data.persona)) return { ok: false, error: locale === "ar" ? "دور غير صالح." : "Invalid role." };

    /* If university student: verify university taxonomy IDs */
    if (data.persona === "student" && data.studentType === 'university') {
      if (data.universityId) {
        const { data: uRow } = await supabase.from("universities").select("id, code").eq("id", data.universityId).maybeSingle();
        if (!uRow) return { ok: false, error: locale === "ar" ? "جامعة غير صالحة." : "Invalid university." };
      }
      if (data.facultyId) {
        const { data: fRow } = await supabase.from("university_faculties").select("id, university_id").eq("id", data.facultyId).maybeSingle();
        if (!fRow || (data.universityId && fRow.university_id !== data.universityId)) return { ok: false, error: locale === "ar" ? "كلية لا تتوافق." : "Faculty does not match." };
      }
      if (data.departmentId) {
        const { data: dRow } = await supabase.from("university_departments").select("id, faculty_id").eq("id", data.departmentId).maybeSingle();
        if (!dRow || (data.facultyId && dRow.faculty_id !== data.facultyId)) return { ok: false, error: locale === "ar" ? "قسم لا يتوافق." : "Department does not match." };
      }
      if (data.academicLevelId) {
        const { data: lRow } = await supabase.from("university_levels").select("id, code").eq("id", data.academicLevelId).maybeSingle();
        if (!lRow) return { ok: false, error: locale === "ar" ? "مستوى غير صالح." : "Invalid level." };
      }
      if (data.semesterId) {
        const { data: sRow } = await supabase.from("university_semesters").select("id, code").eq("id", data.semesterId).maybeSingle();
        if (!sRow) return { ok: false, error: locale === "ar" ? "ترم غير صالح." : "Invalid semester." };
      }
    }

    /* If student and stage selected, verify IDs belong to valid taxonomy relations */
    if (data.persona === "student" && data.studentType !== 'university' && data.stageId) {
      /* Read stage row to confirm code is valid taxonomy record */
      const { data: sRow } = await supabase.from("education_stages").select("id, code").eq("id", data.stageId).maybeSingle();
      if (!sRow) return { ok: false, error: locale === "ar" ? "مرحلة غير صالحة." : "Invalid stage." };
      const validStages = ["PRIMARY", "PREPARATORY", "SECONDARY", "BACCALAUREATE"];
      if (!validStages.includes(sRow.code)) return { ok: false, error: locale === "ar" ? "مرحلة غير موجودة." : "Stage not found." };
      if (data.gradeId) {
        const { data: gRow } = await supabase.from("education_grades").select("id, stage_id").eq("id", data.gradeId).maybeSingle();
        if (!gRow || gRow.stage_id !== data.stageId) return { ok: false, error: locale === "ar" ? "صف لا يتوافق مع المرحلة." : "Grade does not match stage." };
      }
      if (data.trackId) {
        const { data: tRow } = await supabase.from("education_tracks").select("id, stage_id").eq("id", data.trackId).maybeSingle();
        if (!tRow || tRow.stage_id !== data.stageId) return { ok: false, error: locale === "ar" ? "مسار لا يتوافق." : "Track does not match stage." };
        /* Track only allowed for Baccalaureate */
        if (sRow.code !== "BACCALAUREATE") return { ok: false, error: locale === "ar" ? "المسار فقط للبكالوريا." : "Track only for Baccalaureate." };
      }
    }

    const fields: Record<string, unknown> = {
      persona: data.persona,
      onboarded_at: data.onboardedAtIso,
    };
    // School student: existing taxonomy
    if (data.persona === "student" && data.studentType !== 'university') {
      fields.education_stage_id = data.stageId ?? null;
      fields.education_grade_id = data.gradeId ?? null;
      fields.education_track_id = data.trackId ?? null;
      fields.university_id = null;
      fields.faculty_id = null;
      fields.department_id = null;
      fields.academic_level_id = null;
      fields.semester_id = null;
    }
    // University student: university taxonomy (new in 2.6B)
    if (data.persona === "student" && data.studentType === 'university') {
      fields.university_id = data.universityId ?? null;
      fields.faculty_id = data.facultyId ?? null;
      fields.department_id = data.departmentId ?? null;
      fields.academic_level_id = data.academicLevelId ?? null;
      fields.semester_id = data.semesterId ?? null;
      // Keep old fields null for university students to avoid cross-contamination
      fields.education_stage_id = null;
      fields.education_grade_id = null;
      fields.education_track_id = null;
    }
    // Graduate / freelancer: clear both
    if (data.persona !== "student") {
      fields.education_stage_id = null;
      fields.education_grade_id = null;
      fields.education_track_id = null;
      fields.university_id = null;
      fields.faculty_id = null;
      fields.department_id = null;
      fields.academic_level_id = null;
      fields.semester_id = null;
    }

    const { error: upErr } = await supabase
      .from("profiles")
      .upsert({ id: user.id, ...fields }, { onConflict: "id" });
    if (upErr) {
      console.error("onboarding upsert failed:", upErr.message);
      return { ok: false, error: locale === "ar" ? "حفظ فشل." : "Save failed." };
    }
    /* Metadata sync (advisory, non-blocking) */
    void supabase.auth.updateUser({ data: { role: data.persona === "grad" ? "graduate" : data.persona, onboarded_at: data.onboardedAtIso } })
      .then(({ error }) => { if (error) console.error("metadata sync (non-blocking):", error.message); });
    return { ok: true };
  }

  async function finish(): Promise<void> {
    setSaving(true); setError(null);
    const studentTypeFromStorage = typeof window !== 'undefined' ? (window.localStorage.getItem('pendingStudentType') || null) : null;
    const studentTypeParam = studentTypeFromStorage === 'university' ? 'university' : (studentTypeFromStorage === 'school' ? 'school' : null);
    if (role === "student" && studentTypeParam !== 'university' && !stageId) { setError(locale === "ar" ? "اختر المرحلة." : "Select stage."); setSaving(false); return; }
    if (role === "student" && studentTypeParam !== 'university' && stageId && !gradeId) { setError(locale === "ar" ? "اختر الصف." : "Select grade."); setSaving(false); return; }
    if (role === "student" && studentTypeParam === 'university' && !(universityId || (studentTypeFromStorage === 'university' ? (typeof window !== 'undefined' ? window.localStorage.getItem('pendingUniversityId') || null : null) : null))) { setError(locale === "ar" ? "اختر الجامعة." : "Select university."); setSaving(false); return; }
    const iso = new Date().toISOString();
    const persona: "student" | "grad" | "freelancer" = role === "graduate" ? "grad" : role;
    const universityIdFromStorage = studentTypeParam === 'university' ? (typeof window !== 'undefined' ? window.localStorage.getItem('pendingUniversityId') || null : null) : null;
    const facultyIdFromStorage = studentTypeParam === 'university' ? (window.localStorage.getItem('pendingFacultyId') || null) : null;
    const departmentIdFromStorage = studentTypeParam === 'university' ? (window.localStorage.getItem('pendingDepartmentId') || null) : null;
    const academicLevelIdFromStorage = studentTypeParam === 'university' ? (window.localStorage.getItem('pendingAcademicLevelId') || null) : null;
    const semesterIdFromStorage = studentTypeParam === 'university' ? (window.localStorage.getItem('pendingSemesterId') || null) : null;
    const { ok, error: err } = await persist({
      persona,
      studentType: studentTypeParam,
      stageId: (role === "student" && studentTypeParam !== 'university') ? stageId : null,
      gradeId: (role === "student" && studentTypeParam !== 'university') ? gradeId : null,
      trackId: (role === "student" && studentTypeParam !== 'university' && stageId && stages.find(s => s.id === stageId)?.code === "BACCALAUREATE") ? trackId : null,
      universityId: studentTypeParam === 'university' ? universityIdFromStorage : null,
      facultyId: studentTypeParam === 'university' ? facultyIdFromStorage : null,
      departmentId: studentTypeParam === 'university' ? departmentIdFromStorage : null,
      academicLevelId: studentTypeParam === 'university' ? academicLevelIdFromStorage : null,
      semesterId: studentTypeParam === 'university' ? semesterIdFromStorage : null,
      onboardedAtIso: iso,
    });
    if (!ok) {
      setError(err || (locale === "ar" ? "حصلت مشكلة." : "Something went wrong."));
      setSaving(false); return;
    }
    setStep("done");
    /* Short success view then redirect (preserves existing flow) */
    setTimeout(() => {
      const next = currentNext();
      router.push(next || roleHome(role));
      router.refresh();
    }, 800);
  }

  function skip(): void {
    // Default: save with null fields; university student reads from localStorage in finish
    void finish();
  }

  /* ---- Back navigation ---- */
  function goBack(): void {
    if (step === "stage") { setStep("role"); setStageId(null); }
    else if (step === "grade") { setStep("stage"); setGradeId(null); }
    else if (step === "track") { setStep("grade"); setTrackId(null); }
    else if (step === "done") { setStep(role === "student" ? (studentType === 'university' ? "stage" : (stages.find(s => s.id === stageId)?.code === "BACCALAUREATE" ? "track" : "grade")) : "role"); }
  }

  /* ---- Progress indicator (only relevant steps shown) ---- */
  const progressSteps: { key: StepKey; labelAr: string; labelEn: string }[] = [
    { key: "role", labelAr: "الن Role", labelEn: "Role" },
    { key: "stage", labelAr: "المرحلة", labelEn: "Stage" },
    { key: "grade", labelAr: "الصف", labelEn: "Grade" },
    { key: "track", labelAr: "المسار", labelEn: "Track" },
  ];
  const visibleProgress = progressSteps.filter((s) => {
    if (role !== "student") return s.key === "role" || s.key === "done";
    const stageCode = stages.find((st) => st.id === stageId)?.code;
    if (s.key === "track") return !!stageCode && stageCode === "BACCALAUREATE" && step === "track" || step === "done";
    return true;
  });
  const activeIndex = visibleProgress.findIndex((s) => s.key === step || (step === "done" && s.key === "track"));

  if (checking) {
    return (
      <div className="auth" dir={locale === "ar" ? "rtl" : "ltr"}>
        <div className="auth-main"><p className="mono muted">{t.login_loading}</p></div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="auth" dir={locale === "ar" ? "rtl" : "ltr"}>
        <aside className="auth-aside ruled"><BrandLock /></aside>
        <div className="auth-main">
          <div className="auth-form stack" style={{ gap: "16px", textAlign: "center" }}>
            <h1 className="h3">{locale === "ar" ? "🎉 جاهز!" : "Ready!"}</h1>
            <p className="lede">{t.onboard_done_lede}</p>
            <p className="mono muted">→ {roleHome(role)}</p>
          </div>
        </div>
      </div>
    );
  }

  const isStudent = role === "student";
  const baccStageCode = stages.find((s) => s.id === stageId)?.code;
  const showTrack = isStudent && !!stageId && baccStageCode === "BACCALAUREATE" && ((step as string) === "track" || (step as string) === "done");

  return (
    <div className="auth" dir={locale === "ar" ? "rtl" : "ltr"}>
      <aside className="auth-aside ruled">
        <BrandLock />
        <div className="stack" style={{ gap: "16px" }}>
          <h1 className="h2" style={{ maxWidth: "18ch" }}>
            {t.login_title_a} <span className="mark">{t.login_title_mark}</span>
          </h1>
          <p className="lede">{t.login_subtitle}</p>
        </div>
        <Link href="/" className="mono muted" style={{ textDecoration: "none" }}>
          ← {t.login_back}
        </Link>
      </aside>

      <div className="auth-main">
        <div className="auth-form stack" style={{ gap: "20px" }}>
          {/* Progress */}
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div className="row" style={{ gap: "6px", alignItems: "center" }} aria-label="Progress" role="status">
              <span className="eyebrow" style={{ fontSize: ".78rem", margin: 0 }}>
                {locale === "ar" ? "الخطوة" : "Step"} {visibleProgress.findIndex(s => s.key === step) + 1} / {visibleProgress.length}
              </span>
              <div className="row" style={{ gap: "4px" }}>
                {visibleProgress.map((s, i) => (
                  <span
                    key={s.key}
                    style={{
                      width: "20px", height: "20px", borderRadius: "50%",
                      border: `2px solid ${i <= activeIndex ? "var(--ink)" : "var(--rule-strong)"}`,
                      background: i <= activeIndex ? "var(--ink)" : "transparent",
                      color: i <= activeIndex ? "#fff" : "var(--muted)",
                      fontSize: ".7rem", display: "inline-grid", placeItems: "center",
                    }}
                    aria-current={i === activeIndex ? "step" : undefined}
                  >{i + 1}</span>
                ))}
              </div>
            </div>
            <TopControls />
          </div>

          {error && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )}

          {/* STEP 1 — ROLE */}
          {step === "role" && (
            <>
              <h2 className="h3" style={{ margin: 0 }}>
                {locale === "ar" ? "👋 خلينا نجهز Magiclly ليك" : "👋 Let’s set up Magiclly for you"}
              </h2>
              <p className="small muted" style={{ margin: 0 }}>
                {locale === "ar" ? "إنت إيه؟ اختر الدور المناسب." : "What are you? Choose your role."}
              </p>
              <div className="stack" style={{ gap: "10px" }} role="radiogroup" aria-label={locale === "ar" ? "الدور" : "Role"}>
                {[
                  { id: "student" as Role, emoji: "🎓", label: locale === "ar" ? "طالب" : "Student", desc: locale === "ar" ? "مرحلة دراسية + صف" : "Education stage + grade" },
                  { id: "graduate" as Role, emoji: "🎓", label: locale === "ar" ? "خريج" : "Graduate", desc: locale === "ar" ? "المرحلة التالية مباشرة" : "Next step directly" },
                  { id: "freelancer" as Role, emoji: "💻", label: "Freelancer", desc: locale === "ar" ? "بدون مرحلة دراسية" : "No education stage" },
                ].map((opt) => {
                  const selected = role === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setRole(opt.id)}
                      className="row"
                      style={{
                        gap: "12px", padding: "14px 16px",
                        background: selected ? "color-mix(in srgb, var(--marker) 14%, transparent)" : "var(--paper)",
                        border: `1.5px solid ${selected ? "var(--ink)" : "var(--rule-strong)"}`,
                        borderRadius: "var(--r-sm)", cursor: "pointer", font: "inherit",
                        color: "inherit", textAlign: "start",
                      }}
                    >
                      <span style={{ fontSize: "1.5rem", lineHeight: 1.2 }}>{opt.emoji}</span>
                      <span className="stack" style={{ gap: 0 }}>
                        <b style={{ fontFamily: "var(--font-display)" }}>{opt.label}</b>
                        <span className="small muted">{opt.desc}</span>
                      </span>
                      <span aria-hidden="true" style={{
                        marginInlineStart: "auto", width: "22px", height: "22px", borderRadius: "50%",
                        display: "grid", placeItems: "center", border: "1.5px solid var(--rule-strong)",
                        background: selected ? "var(--ink)" : "transparent", color: selected ? "var(--paper-2)" : "transparent", flex: "none",
                      }}>{selected ? "✓" : ""}</span>
                    </button>
                  );
                })}
              </div>

              <button type="button" className="btn btn-marker btn-block" onClick={() => setStep(isStudent ? "stage" : "done")}>
                {locale === "ar" ? "استمر" : "Continue"}
              </button>
              <button type="button" className="small muted" style={{ alignSelf: "center", background: "none", border: 0, padding: 0, font: "inherit", textDecoration: "underline", cursor: "pointer" }} onClick={skip} disabled={saving}>
                {locale === "ar" ? "تخطي (حفظ افتراضي)" : "Skip (default save)"}
              </button>
            </>
          )}

          {/* STEP 2 — STAGE (student only) */}
          {step === "stage" && isStudent && (
            <>
              <h2 className="h3" style={{ margin: 0 }}>
                {locale === "ar" ? "إيه مرحلتك الدراسية؟" : "What is your education stage?"}
              </h2>
              <p className="small muted" style={{ margin: 0 }}>
                {locale === "ar" ? "من قاعدة البيانات — لا تعتمد على أسماء ثابتة." : "From the database — not hardcoded names."}
              </p>
              {loadingTax && stages.length === 0 ? (
                <p className="mono muted">{t.login_loading}</p>
              ) : (
                <div className="stack" style={{ gap: "10px" }} role="radiogroup" aria-label={locale === "ar" ? "المرحلة" : "Education stage"}>
                  {stages.map((s) => {
                    const selected = stageId === s.id;
                    return (
                      <button key={s.id} type="button" role="radio" aria-checked={selected}
                        onClick={() => { setStageId(s.id); setGradeId(null); setTrackId(null); }}
                        className="row" style={{
                          gap: "12px", padding: "14px 16px", borderRadius: "var(--r-sm)",
                          border: `1.5px solid ${selected ? "var(--ink)" : "var(--rule-strong)"}`,
                          background: selected ? "color-mix(in srgb, var(--marker) 14%, transparent)" : "var(--paper)",
                          cursor: "pointer", font: "inherit", color: "inherit", textAlign: "start",
                        }}>
                        <b style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem" }}>{s.name}</b>
                        <span className="small muted" style={{ marginInlineStart: "auto" }}>{s.code}</span>
                      </button>
                    );
                  })}
                  {stages.length === 0 && (<p className="small muted">{locale === "ar" ? "لم يتم تحميل المراحل." : "Stages not loaded."}</p>)}
                </div>
              )}
              <div className="row" style={{ gap: "10px" }}>
                <button type="button" className="btn btn-marker btn-block" onClick={() => { if (stageId) { setStep("grade"); } else { setError(locale === "ar" ? "اختر مرحلة." : "Select stage."); } }} disabled={saving || !stageId}>
                  {locale === "ar" ? "استمر" : "Continue"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={goBack} disabled={saving}>← {locale === "ar" ? "رجوع" : "Back"}</button>
              </div>
            </>
          )}

          {/* STEP 2B — UNIVERSITY (student university only) */}
          {step === "stage" && isStudent && studentType === 'university' && (
            <>
              <h2 className="h3" style={{ margin: 0 }}>
                {locale === "ar" ? "بيانات الجامعة" : "University details"}
              </h2>
              <p className="small muted" style={{ margin: 0 }}>
                {locale === "ar" ? "من قاعدة البيانات — لا تعتمد على أسماء ثابتة." : "From the database — verified taxonomy."}
              </p>
              <div className="stack" style={{ gap: "10px" }} role="radiogroup" aria-label={locale === "ar" ? "الجامعة" : "University"}>
                {/* University */}
                <div>
                  <b className="small">{locale === "ar" ? "الجامعة" : "University"}</b>
                  <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
                    {uniData.universities.map((u: any) => (
                      <button key={u.id} type="button" className="chip" aria-pressed={universityId === u.id} onClick={() => setUniversityId(u.id)} style={{ padding: "9px 16px", borderRadius: "999px", border: `1.5px solid ${universityId === u.id ? "var(--ink)" : "var(--rule-strong)"}`, background: universityId === u.id ? "var(--ink)" : "var(--paper)", color: universityId === u.id ? "var(--paper-2)" : "var(--ink)", fontSize: "var(--t-sm)", fontWeight: 600, cursor: "pointer", font: "inherit" }}>{u.name}</button>
                    ))}
                  </div>
                </div>
                {/* Faculty */}
                {universityId && (
                  <div>
                    <b className="small">{locale === "ar" ? "الكلية" : "Faculty"}</b>
                    <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
                      {uniData.faculties.filter((f: any) => f.university_id === universityId).map((f: any) => (
                        <button key={f.id} type="button" className="chip" aria-pressed={facultyId === f.id} onClick={() => setFacultyId(f.id)} style={{ padding: "9px 16px", borderRadius: "999px", border: `1.5px solid ${facultyId === f.id ? "var(--ink)" : "var(--rule-strong)"}`, background: facultyId === f.id ? "var(--ink)" : "var(--paper)", color: facultyId === f.id ? "var(--paper-2)" : "var(--ink)", fontSize: "var(--t-sm)", fontWeight: 600, cursor: "pointer", font: "inherit" }}>{f.name}</button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Department */}
                {facultyId && (
                  <div>
                    <b className="small">{locale === "ar" ? "القسم" : "Department"}</b>
                    <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
                      {uniData.departments.filter((d: any) => d.faculty_id === facultyId).map((d: any) => (
                        <button key={d.id} type="button" className="chip" aria-pressed={departmentId === d.id} onClick={() => setDepartmentId(d.id)} style={{ padding: "9px 16px", borderRadius: "999px", border: `1.5px solid ${departmentId === d.id ? "var(--ink)" : "var(--rule-strong)"}`, background: departmentId === d.id ? "var(--ink)" : "var(--paper)", color: departmentId === d.id ? "var(--paper-2)" : "var(--ink)", fontSize: "var(--t-sm)", fontWeight: 600, cursor: "pointer", font: "inherit" }}>{d.name}</button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Level */}
                {departmentId && (
                  <div>
                    <b className="small">{locale === "ar" ? "المستوى" : "Academic Level"}</b>
                    <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
                      {uniData.levels.map((l: any) => (
                        <button key={l.id} type="button" className="chip" aria-pressed={academicLevelId === l.id} onClick={() => setAcademicLevelId(l.id)} style={{ padding: "9px 16px", borderRadius: "999px", border: `1.5px solid ${academicLevelId === l.id ? "var(--ink)" : "var(--rule-strong)"}`, background: academicLevelId === l.id ? "var(--ink)" : "var(--paper)", color: academicLevelId === l.id ? "var(--paper-2)" : "var(--ink)", fontSize: "var(--t-sm)", fontWeight: 600, cursor: "pointer", font: "inherit" }}>{l.name}</button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Semester */}
                {academicLevelId && (
                  <div>
                    <b className="small">{locale === "ar" ? "الترم" : "Semester"}</b>
                    <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
                      {uniData.semesters.map((s: any) => (
                        <button key={s.id} type="button" className="chip" aria-pressed={semesterId === s.id} onClick={() => setSemesterId(s.id)} style={{ padding: "9px 16px", borderRadius: "999px", border: `1.5px solid ${semesterId === s.id ? "var(--ink)" : "var(--rule-strong)"}`, background: semesterId === s.id ? "var(--ink)" : "var(--paper)", color: semesterId === s.id ? "var(--paper-2)" : "var(--ink)", fontSize: "var(--t-sm)", fontWeight: 600, cursor: "pointer", font: "inherit" }}>{s.name}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="row" style={{ gap: "10px" }}>
                <button type="button" className="btn btn-marker btn-block" onClick={() => { if (universityId && facultyId && departmentId && academicLevelId && semesterId) { setStep("done"); } else { setError(locale === "ar" ? "أكمل بيانات الجامعة." : "Complete university details."); } }} disabled={saving || !(universityId && facultyId && departmentId && academicLevelId && semesterId)}>
                  {locale === "ar" ? "استمر" : "Continue"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={goBack} disabled={saving}>← {locale === "ar" ? "رجوع" : "Back"}</button>
              </div>
            </>
          )}

          {/* STEP 3 — GRADE */}
          {step === "grade" && isStudent && (
            <>
              <h2 className="h3" style={{ margin: 0 }}>
                {locale === "ar" ? "الصف" : "Grade"}
              </h2>
              <p className="small muted" style={{ margin: 0 }}>
                {locale === "ar" ? "من taxonomy — فقط الصفوف التابعة للمرحلة المختارة." : "From taxonomy — only grades for selected stage."}
              </p>
              {loadingTax ? <p className="mono muted">{t.login_loading}</p> : (
                <div className="row" style={{ gap: "8px", flexWrap: "wrap" }} role="radiogroup" aria-label={locale === "ar" ? "الصف" : "Grade"}>
                  {grades.map((g) => {
                    const selected = gradeId === g.id;
                    return (
                      <button key={g.id} type="button" role="radio" aria-checked={selected}
                        onClick={() => { setGradeId(g.id); setTrackId(null); }}
                        style={{
                          padding: "9px 16px", borderRadius: "999px", border: `1.5px solid ${selected ? "var(--ink)" : "var(--rule-strong)"}`,
                          background: selected ? "var(--ink)" : "var(--paper)", color: selected ? "var(--paper-2)" : "var(--ink)",
                          fontSize: "var(--t-sm)", fontWeight: 600, cursor: "pointer", font: "inherit",
                        }}>{g.name}</button>
                    );
                  })}
                  {grades.length === 0 && <p className="small muted">{locale === "ar" ? "لا توجد صفوف." : "No grades."}</p>}
                </div>
              )}
              <div className="row" style={{ gap: "10px" }}>
                <button type="button" className="btn btn-marker btn-block" onClick={() => {
                  if (!gradeId) { setError(locale === "ar" ? "اختر صف." : "Select grade."); return; }
                  const stageCode = stages.find((s) => s.id === stageId)?.code;
                  setStep(stageCode === "BACCALAUREATE" ? "track" : "done");
                }} disabled={saving || !gradeId}>
                  {locale === "ar" ? "استمر" : "Continue"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={goBack} disabled={saving}>← {locale === "ar" ? "رجوع" : "Back"}</button>
              </div>
            </>
          )}

          {/* STEP 4 — TRACK (Baccalaureate only) */}
          {step === "track" && isStudent && showTrack && (
            <>
              <h2 className="h3" style={{ margin: 0 }}>
                {locale === "ar" ? "المسار (البكالوريا فقط)" : "Track (Baccalaureate only)"}
              </h2>
              <p className="small muted" style={{ margin: 0 }}>
                {locale === "ar" ? "من taxonomy — Medicine / Engineering / Business / Humanities." : "From taxonomy — Medicine / Engineering / Business / Humanities."}
              </p>
              {loadingTax ? <p className="mono muted">{t.login_loading}</p> : (
                <div className="stack" style={{ gap: "10px" }} role="radiogroup" aria-label={locale === "ar" ? "المسار" : "Track"}>
                  {tracks.map((tr) => {
                    const selected = trackId === tr.id;
                    return (
                      <button key={tr.id} type="button" role="radio" aria-checked={selected}
                        onClick={() => setTrackId(tr.id)}
                        className="row" style={{
                          gap: "12px", padding: "14px 16px", borderRadius: "var(--r-sm)",
                          border: `1.5px solid ${selected ? "var(--ink)" : "var(--rule-strong)"}`,
                          background: selected ? "color-mix(in srgb, var(--marker) 14%, transparent)" : "var(--paper)",
                          cursor: "pointer", font: "inherit", color: "inherit", textAlign: "start",
                        }}>
                        <b style={{ fontFamily: "var(--font-display)" }}>{tr.name}</b>
                        <span className="small muted" style={{ marginInlineStart: "auto" }}>{tr.code}</span>
                      </button>
                    );
                  })}
                  {tracks.length === 0 && (<p className="small muted">{locale === "ar" ? "لا توجد مسارات لهذا الصف." : "No tracks for this grade."}</p>)}
                </div>
              )}
              <div className="row" style={{ gap: "10px" }}>
                <button type="button" className="btn btn-marker btn-block" onClick={() => setStep("done")} disabled={saving}>
                  {locale === "ar" ? "ابدأ Magiclly" : "Start Magiclly"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={goBack} disabled={saving}>← {locale === "ar" ? "رجوع" : "Back"}</button>
              </div>
            </>
          )}

          {/* STEP 3/4 FALLBACK — if student skips stage via back/edit logic not expected */}
          {step === "grade" && !isStudent && (
            <>
              <h2 className="h3">{locale === "ar" ? "الخريج / Freelancer — لا تحتاج اختيار مرحلة." : "Graduate / Freelancer — no stage needed."}</h2>
              <button type="button" className="btn btn-marker btn-block" onClick={() => setStep("done")}>{locale === "ar" ? "ابدأ Magiclly" : "Start Magiclly"}</button>
              <button type="button" className="btn btn-secondary" onClick={goBack}>← {locale === "ar" ? "رجوع" : "Back"}</button>
            </>
          )}

          <p className="mono muted" style={{ margin: 0 }}>
            {t.onboarding_changeable_later}
          </p>
        </div>
      </div>
    </div>
  );
}
