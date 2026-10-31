"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, LoadingSheets, DataNotice } from "../../components/PageShell";
import { useAuthUser } from "../../components/use-page-data";
import { fetchMaterials } from "@/lib/pages-data";
import type { Material } from "@/lib/pages-data";

export default function InboxPage() {
  const router = useRouter();
  const { supabase, session } = useAuthUser();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [lectures, setLectures] = useState<{ id: string; title: string; status: string | null }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session.status === "loading") return;
    if (session.status === "anonymous") { router.push("/dashboard"); return; }
    if (session.status === "error" || !supabase || !session.user) return;
    const uid = session.user.id;
    (async () => {
      setLoading(true);
      const [m, l] = await Promise.all([
        fetchMaterials(supabase, uid),
        supabase.from("lectures").select("id, title, status").eq("user_id", uid).order("created_at", { ascending: false }),
      ]);
      if (m.error) setNotice(m.error.message);
      else setMaterials(m.data ?? []);
      setLectures((l.data ?? []) as { id: string; title: string; status: string | null }[]);
      setLoading(false);
    })();
  }, [session, supabase, router]);

  return (
    <PageShell title="الملفات غير المنظمة" subtitle="Inbox — صنّفها manually">
      {notice && <DataNotice message={notice} />}
      {loading ? <LoadingSheets /> : (
        <div className="space-y-4">
          <div className="sheet-card p-4">
            <h3 className="font-semibold mb-2">المحاضرات</h3>
            {lectures.length === 0 ? <p className="tag">لا توجد محاضرات غير منظمة.</p> : lectures.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-2 border-b border-rule last:border-0">
                <span className="text-sm">{l.title}</span>
                <div className="flex items-center gap-2">
                  {l.status && <span className="tag">{l.status}</span>}
                  <button className="btn text-xs" disabled>تنظيم</button>
                </div>
              </div>
            ))}
          </div>
          <div className="sheet-card p-4">
            <h3 className="font-semibold mb-2">الملفات</h3>
            {materials.length === 0 ? <p className="tag">لا توجد ملفات غير منظمة.</p> : materials.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2 border-b border-rule last:border-0">
                <span className="text-sm">{m.title}</span>
                <button className="btn text-xs" disabled>تنظيم</button>
              </div>
            ))}
          </div>
          <p className="tag">ربط التصنيف بقاعدة البيانات será بعد اعتماد Migration.</p>
          <button className="btn text-sm" onClick={() => router.push("/dashboard/workspace/home")}>رجوع</button>
        </div>
      )}
    </PageShell>
  );
}
