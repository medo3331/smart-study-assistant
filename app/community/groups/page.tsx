"use client";

// ===========================================================================
// MAGICLY — Community C3: صفحة المجموعات /community/groups
// ===========================================================================
// استكشاف المجموعات (بحث + تصنيف) · مجموعاتي · إنشاء مجموعة جديدة.
// المجموعات الخاصة تظهر باسمها فقط وطلب الانضمام بيتقدر للمشرفين.
// كل القراءة والكتابة عبر /api/community/groups والـRPCs بتفرض القواعد.
// ===========================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Users, Plus, Loader2, Lock, Globe, GraduationCap, X } from "lucide-react";

type GroupRow = {
  group_id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: string;
  privacy: string;
  university: string | null;
  faculty: string | null;
  major: string | null;
  year: string | null;
  member_count: number;
  my_status: string;
  created_at?: string;
};

type MyGroupRow = {
  group_id: string;
  slug: string;
  name: string;
  kind: string;
  privacy: string;
  member_count: number;
  my_role: string;
};

const KIND_AR: Record<string, string> = {
  general: "عام",
  university: "جامعة",
  faculty: "كلية",
  major: "تخصص",
  batch: "دفعة",
  study: "مذاكرة",
};

const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
const primaryBtn = `${btn} bg-marker text-white hover:opacity-90`;
const ghostBtn = `${btn} border border-rule text-ink hover:bg-paper-2`;
const inputCls = "w-full rounded-xl border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-marker";

export default function CommunityGroupsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [myGroups, setMyGroups] = useState<MyGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState("general");
  const [privacy, setPrivacy] = useState("public");
  const [faculty, setFaculty] = useState("");
  const [major, setMajor] = useState("");
  const [year, setYear] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (kindFilter) params.set("kind", kindFilter);
    if (query.trim()) params.set("q", query.trim());
    const [discoverRes, mineRes] = await Promise.all([
      fetch(`/api/community/groups?${params.toString()}`).catch(() => null),
      fetch("/api/community/groups?scope=mine").catch(() => null),
    ]);
    if (discoverRes?.status === 401) {
      setAuthed(false);
      setLoading(false);
      return;
    }
    const discoverData = discoverRes?.ok ? await discoverRes.json().catch(() => null) : null;
    const mineData = mineRes?.ok ? await mineRes.json().catch(() => null) : null;
    setGroups(discoverData?.groups ?? []);
    setMyGroups(mineData?.groups ?? []);
    setAuthed(true);
    setLoading(false);
  }, [kindFilter, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const groupAction = async (groupId: string, action: "join" | "leave" | "cancel") => {
    setBusyId(groupId);
    setActionError(null);
    try {
      const res = await fetch(`/api/community/groups/${groupId}/membership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        const code = data.code as string | undefined;
        setActionError(
          code === "already_requested"
            ? "طلباتك/عضويتك مسجلة بالفعل في المجموعة."
            : code === "owner_cannot_leave"
              ? "صاحب المجموعة مش يقدر يسيبها."
              : "حصل خطأ — جرّب تاني.",
        );
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const createGroup = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/community/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          kind,
          privacy,
          faculty: faculty || null,
          major: major || null,
          year: year || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setShowCreate(false);
        setName("");
        setDescription("");
        setKind("general");
        setPrivacy("public");
        setFaculty("");
        setMajor("");
        setYear("");
        await load();
      } else {
        const code = data.code as string | undefined;
        setCreateError(
          code === "rate_limited"
            ? "عملت مجموعات كتير قريب — استنى شوية."
            : code === "invalid_name"
              ? "اسم المجموعة لازم يكون بين حرفين و80 حرف."
              : "حصل خطأ — جرّب تاني.",
        );
      }
    } finally {
      setCreating(false);
    }
  };

  if (authed === false) {
    return (
      <div className="min-h-screen bg-paper text-ink" dir="rtl">
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-lg font-bold">سجّل دخولك الأول عشان تشوف المجموعات.</p>
          <Link href="/login?next=/community/groups" className={`${primaryBtn} mt-4`}>
            تسجيل الدخول
          </Link>
        </div>
      </div>
    );
  }

  const groupCard = (g: GroupRow) => (
    <div key={g.group_id} className="rounded-2xl border border-rule bg-paper-2/50 p-4 transition hover:border-marker/40">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/community/groups/${g.group_id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-bold text-ink hover:text-marker">{g.name}</span>
            {g.privacy === "private" ? (
              <Lock className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-label="مجموعة خاصة" />
            ) : (
              <Globe className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-label="مجموعة عامة" />
            )}
          </div>
          {g.description && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{g.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            <span className="rounded-full bg-marker/10 px-2 py-0.5 font-semibold text-marker">{KIND_AR[g.kind] ?? g.kind}</span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {g.member_count} عضو
            </span>
            {(g.faculty || g.university) && <span className="truncate">{g.faculty ?? g.university}</span>}
          </div>
        </Link>
        <div className="shrink-0">
          {g.my_status === "approved" ? (
            <button className={ghostBtn} disabled={busyId === g.group_id} onClick={() => void groupAction(g.group_id, "leave")}>
              مغادرة
            </button>
          ) : g.my_status === "pending" ? (
            <button className={ghostBtn} disabled={busyId === g.group_id} onClick={() => void groupAction(g.group_id, "cancel")}>
              إلغاء الطلب
            </button>
          ) : (
            <button className={primaryBtn} disabled={busyId === g.group_id} onClick={() => void groupAction(g.group_id, "join")}>
              {g.privacy === "private" ? "طلب انضمام" : "انضمام"}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-paper text-ink" dir="rtl">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">المجموعات</h1>
            <p className="text-sm text-ink-soft">مجتمعات الجامعة والكلية والتخصص ومجموعات المذاكرة.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/community" className={ghostBtn}>
              رجوع للمجتمع
            </Link>
            <button className={primaryBtn} onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              مجموعة جديدة
            </button>
          </div>
        </header>

        {actionError && (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-600" role="alert">
            {actionError}
          </div>
        )}

        {/* مجموعاتي */}
        {myGroups.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-sm font-bold text-ink-soft">مجموعاتي</h2>
            <div className="flex flex-wrap gap-2">
              {myGroups.map((g) => (
                <Link
                  key={g.group_id}
                  href={`/community/groups/${g.group_id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-rule bg-paper-2 px-3 py-1.5 text-sm font-semibold text-ink transition hover:border-marker/50 hover:text-marker"
                >
                  {g.name}
                  <span className="text-xs text-ink-soft">{g.member_count}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* البحث والتصنيف */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              className={`${inputCls} pr-9`}
              placeholder="ابحث في المجموعات…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load()}
              aria-label="بحث في المجموعات"
            />
          </div>
          <button className={`${ghostBtn} ${kindFilter === null ? "border-marker text-marker" : ""}`} onClick={() => setKindFilter(null)}>
            الكل
          </button>
          {Object.entries(KIND_AR).map(([id, label]) => (
            <button
              key={id}
              className={`${ghostBtn} ${kindFilter === id ? "border-marker text-marker" : ""}`}
              onClick={() => setKindFilter(id)}
            >
              {label}
            </button>
          ))}
          <button className={ghostBtn} onClick={() => void load()} aria-label="تحديث">
            <Loader2 className={`h-4 w-4 ${loading ? "animate-spin" : "opacity-0"}`} />
            بحث
          </button>
        </div>

        {/* الاستكشاف */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-ink-soft" />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-rule py-12 text-center text-ink-soft">
            <GraduationCap className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p className="font-semibold">مفيش مجموعات لسه</p>
            <p className="mt-1 text-sm">اعمل أول مجموعة لزمايلك في الكلية أو الدفعة.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">{groups.map(groupCard)}</div>
        )}
      </div>

      {/* نافذة إنشاء مجموعة */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-rule bg-paper p-5 shadow-xl" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">مجموعة جديدة</h2>
              <button onClick={() => setShowCreate(false)} aria-label="إغلاق" className="text-ink-soft hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input className={inputCls} placeholder="اسم المجموعة *" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              <textarea className={inputCls} placeholder="وصف قصير (اختياري)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
              <div className="flex flex-wrap gap-2">
                {Object.entries(KIND_AR).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`${ghostBtn} ${kind === id ? "border-marker text-marker" : ""}`}
                    onClick={() => setKind(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" className={`${ghostBtn} flex-1 ${privacy === "public" ? "border-marker text-marker" : ""}`} onClick={() => setPrivacy("public")}>
                  <Globe className="h-4 w-4" /> عامة
                </button>
                <button type="button" className={`${ghostBtn} flex-1 ${privacy === "private" ? "border-marker text-marker" : ""}`} onClick={() => setPrivacy("private")}>
                  <Lock className="h-4 w-4" /> خاصة
                </button>
              </div>
              {(kind === "faculty" || kind === "major" || kind === "batch") && (
                <input className={inputCls} placeholder="الكلية" value={faculty} onChange={(e) => setFaculty(e.target.value)} maxLength={120} />
              )}
              {kind === "major" && (
                <input className={inputCls} placeholder="التخصص" value={major} onChange={(e) => setMajor(e.target.value)} maxLength={120} />
              )}
              {kind === "batch" && (
                <input className={inputCls} placeholder="سنة الدفعة" value={year} onChange={(e) => setYear(e.target.value)} maxLength={40} />
              )}
              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <button className={`${primaryBtn} w-full justify-center`} disabled={creating || name.trim().length < 2} onClick={() => void createGroup()}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                إنشاء المجموعة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
