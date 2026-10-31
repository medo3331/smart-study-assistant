"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageShell, LoadingSheets, DataNotice } from "@/app/dashboard/components/PageShell";
import { useAuthUser } from "@/app/dashboard/components/use-page-data";
import { fetchSubject, type WorkspaceSubject } from "@/lib/academic-workspace";

export default function SubjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { supabase, session } = useAuthUser();
  const [subject, setSubject] = useState<WorkspaceSubject | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session.status === "loading") return;
    if (session.status === "anonymous") { router.push("/dashboard"); return; }
    if (session.status !== "ready" || !supabase || !params?.id) return;
    (async () => {
      setLoading(true);
      const res = await fetchSubject(supabase, session.user.id, params.id);
      if (res.error) setNotice(res.error.message);
      else setSubject(res.data);
      setLoading(false);
    })();
  }, [session, supabase, router, params]);

  return (
    <PageShell eyebrow="مادة" title={subject?.name ?? "مادة"} lede="محاضرات، ملفات، وموارد المادة">
      {notice && <DataNotice message={notice} />}
      {loading ? <LoadingSheets /> : subject ? (
        <div className="space-y-4">
          <div className="sheet-card p-4">
            <p className="tag">{subject.stage}</p>
            {subject.curriculum && <p className="text-sm">{subject.curriculum}</p>}
            {subject.gradeOrYear && <p className="text-sm">{subject.gradeOrYear}</p>}
            {subject.specialization && <p className="text-sm">{subject.specialization}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sheet-card p-4"><h3 className="font-semibold">المحاضرات</h3><p className="tag">قريباً</p></div>
            <div className="sheet-card p-4"><h3 className="font-semibold">الملفات والموارد</h3><p className="tag">قريباً</p></div>
          </div>
          <button className="btn text-sm" onClick={() => router.push("/dashboard/workspace/home")}>رجوع</button>
        </div>
      ) : (
        <p className="tag">المادة غير موجودة.</p>
      )}
    </PageShell>
  );
}
