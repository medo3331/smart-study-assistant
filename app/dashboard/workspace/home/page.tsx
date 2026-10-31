"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, EmptyState, LoadingSheets, DataNotice } from "../../components/PageShell";
import { useAuthUser } from "../../components/use-page-data";
import { fetchSubjects, createSubject, type WorkspaceSubject, type AcademicStage } from "@/lib/academic-workspace";
import { fetchMaterials } from "@/lib/pages-data";

export default function WorkspaceHomePage() {
  const router = useRouter();
  const { supabase, session } = useAuthUser();
  const [subjects, setSubjects] = useState<WorkspaceSubject[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [stage, setStage] = useState<AcademicStage>("university");
  const [curriculum, setCurriculum] = useState("");
  const [grade, setGrade] = useState("");
  const [spec, setSpec] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (session.status === "loading") return;
    if (session.status === "anonymous") { router.push("/dashboard"); return; }
    if (session.status !== "ready" || !supabase) return;
    const uid = session.user.id;
    (async () => {
      setLoading(true);
      const [sRes, mRes, lRes] = await Promise.all([
        fetchSubjects(supabase, uid),
        fetchMaterials(supabase, uid),
        supabase.from("lectures").select("id", { count: "exact", head: true }).eq("user_id", uid),
      ]);
      if (sRes.error) setNotice(sRes.error.message);
      else setSubjects(sRes.data ?? []);
      setInboxCount((mRes.data ?? []).length + (lRes.count ?? 0));
      setLoading(false);
    })();
  }, [session, supabase, router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (session.status !== "ready" || !supabase) return;
    setCreating(true);
    const res = await createSubject(supabase, session.user.id, {
      name: name.trim(), stage,
      curriculum: curriculum.trim() || null,
      gradeOrYear: grade.trim() || null,
      specialization: spec.trim() || null,
    });
    if (res.error) setNotice(res.error.message);
    else if (res.data) {
      setSubjects((prev) => [res.data!, ...prev]);
      setShowCreate(false); setName(""); setCurriculum(""); setGrade(""); setSpec("");
    }
    setCreating(false);
  }

  const stageLabel: Record<AcademicStage, string> = { basic: "ابتدائي", secondary: "متوسط/ثانوي", university: "جامعي", postgraduate: "دراسات عليا" };

  return (
    <PageShell title="مساحة العمل الأكاديمية" lede="موادك، محاضراتك، وملفاتك في مكان واحد">
      {notice && <DataNotice message={notice} />}
      {loading ? <LoadingSheets /> : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">موادك</h2>
            <button className="btn btn-marker text-sm" onClick={() => setShowCreate(true)}>+ مادة جديدة</button>
          </div>
          {subjects.length === 0 ? (
            <EmptyState icon="📚" title="لا توجد مواد بعد" body="أنشئ أول مادة دراسية لتنظيم محاضراتك وملفاتك." action={<button className="btn btn-marker text-sm" onClick={() => setShowCreate(true)}>إنشاء مادة</button>} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {subjects.map((s) => (
                <button key={s.id} onClick={() => router.push(`/dashboard/workspace/subjects/${s.id}`)} className="sheet-card p-4 text-right">
                  <div className="font-semibold">{s.name}</div>
                  <div className="tag mt-1"><span>{stageLabel[s.stage]}</span>{s.curriculum && <span>{s.curriculum}</span>}{s.gradeOrYear && <span>{s.gradeOrYear}</span>}</div>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => router.push("/dashboard/workspace/inbox")} className="sheet-card p-4 w-full text-right flex items-center justify-between">
            <span><span className="font-semibold">الملفات غير المنظمة</span><span className="tag mt-1 block">Inbox</span></span>
            <span className="tag">{inboxCount}</span>
          </button>
        </>
      )}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="sheet-card p-5 w-full max-w-md space-y-3">
            <h3 className="font-bold">مادة جديدة</h3>
            <input className="field w-full" placeholder="اسم المادة" value={name} onChange={(e) => setName(e.target.value)} required />
            <select className="field w-full" value={stage} onChange={(e) => setStage(e.target.value as AcademicStage)}>
              <option value="basic">ابتدائي</option>
              <option value="secondary">متوسط/ثانوي</option>
              <option value="university">جامعي</option>
              <option value="postgraduate">دراسات عليا</option>
            </select>
            {stage === "university" || stage === "postgraduate" ? (
              <input className="field w-full" placeholder="المنهج (اختياري)" value={curriculum} onChange={(e) => setCurriculum(e.target.value)} />
            ) : null}
            <input className="field w-full" placeholder="السنة/الصف (اختياري)" value={grade} onChange={(e) => setGrade(e.target.value)} />
            <input className="field w-full" placeholder="التخصص (اختياري)" value={spec} onChange={(e) => setSpec(e.target.value)} />
            <div className="flex gap-2">
              <button type="submit" disabled={creating} className="btn btn-marker text-sm">{creating ? "..." : "إنشاء"}</button>
              <button type="button" className="btn text-sm" onClick={() => setShowCreate(false)}>إلغاء</button>
            </div>
          </form>
        </div>
      )}
    </PageShell>
  );
}
