"use client";

// ===========================================================================
// MAGICLY — Community C3: صفحة المجموعة /community/groups/[id]
// ===========================================================================
// الترويسة (الاسم، النوع، الخصوصية، عدد الأعضاء) + زر الانضمام/المغادرة،
// الأعضاء (أزرار قبول/رفض طلبات الانضمام للمشرفين)، وفي منشورات المجموعة
// محرر كتابة مدمج. القراءة والكتابة كلها عبر /api/community/groups/*.
// ===========================================================================

import { useCallback, useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Lock, Globe, Users, ImagePlus, Check, X, UserPlus, Crown, Shield } from "lucide-react";
import PostCard from "@/components/community/PostCard";
import type { CommunityPostRow } from "@/lib/community/types";
import { POST_KIND_AR, postErrorAr } from "@/lib/community/types";

type GroupDetails = {
  found: boolean;
  limited?: boolean;
  group_id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: string;
  privacy: string;
  university?: string | null;
  faculty?: string | null;
  major?: string | null;
  year?: string | null;
  member_count: number;
  my_membership: { status: string; role: string | null; is_member: boolean; is_moderator: boolean };
};

type MemberRow = {
  user_id: string;
  display_name: string | null;
  public_user_code: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: string;
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
const smallBtn = "inline-flex items-center gap-1.5 rounded-lg border border-rule px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-paper-2 disabled:opacity-50";
const inputCls = "w-full rounded-xl border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-marker";

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // members
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [requests, setRequests] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  // feed
  const [posts, setPosts] = useState<CommunityPostRow[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // composer
  const [postKind, setPostKind] = useState("text");
  const [postBody, setPostBody] = useState("");
  const [postImage, setPostImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDetails = useCallback(async () => {
    const res = await fetch(`/api/community/groups/${id}`).catch(() => null);
    if (res?.status === 401) {
      window.location.href = "/login?next=/community/groups/" + id;
      return;
    }
    const data = res?.ok ? await res.json().catch(() => null) : null;
    if (!data?.success || !data.group?.found) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setGroup(data.group as GroupDetails);
    setLoading(false);
  }, [id]);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    const res = await fetch(`/api/community/groups/${id}/members`).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    setMembers(data?.members ?? []);
    setRequests(data?.requests ?? []);
    setMembersLoading(false);
  }, [id]);

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    const res = await fetch(`/api/community/groups/${id}/posts`).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    setPosts(data?.posts ?? []);
    setFeedLoading(false);
  }, [id]);

  useEffect(() => {
    void loadDetails();
    void loadMembers();
    void loadFeed();
    void (async () => {
      const res = await fetch("/api/community/profile").catch(() => null);
      const data = res?.ok ? await res.json().catch(() => null) : null;
      setCurrentUserId(data?.profile?.user_id ?? null);
    })();
  }, [loadDetails, loadMembers, loadFeed]);

  const membershipAction = async (action: "join" | "leave" | "cancel") => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/community/groups/${id}/membership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setActionError(data.code === "owner_cannot_leave" ? "صاحب المجموعة مش يقدر يسيبها." : "حصل خطأ — جرّب تاني.");
      }
      await Promise.all([loadDetails(), loadMembers()]);
    } finally {
      setBusy(false);
    }
  };

  const memberAction = async (action: "approve" | "reject" | "remove" | "role", userId: string, role?: string) => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/community/groups/${id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userId, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setActionError("تعذّر تنفيذ الإجراء.");
      }
      await Promise.all([loadMembers(), loadDetails()]);
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    setPublishError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/community/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setPostImage(data.url as string);
      } else {
        setPublishError(data.error || "تعذّر رفع الصورة.");
      }
    } finally {
      setUploading(false);
    }
  };

  const publish = async () => {
    if (!postBody.trim()) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/community/groups/${id}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: postKind, body: postBody, imageUrl: postImage }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setPostBody("");
        setPostImage(null);
        setPostKind("text");
        await loadFeed();
      } else {
        setPublishError(postErrorAr(data.code, data.error || "تعذّر النشر."));
      }
    } finally {
      setPublishing(false);
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-paper text-ink" dir="rtl">
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-lg font-bold">المجموعة مش متاحة أو مش موجودة.</p>
          <Link href="/community/groups" className={`${ghostBtn} mt-4`}>
            رجوع للمجموعات
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !group) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-ink" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-ink-soft" />
      </div>
    );
  }

  const my = group.my_membership;
  const isModerator = my.is_moderator;
  const canPost = my.is_member;

  return (
    <div className="min-h-screen bg-paper text-ink" dir="rtl">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Link href="/community/groups" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-marker">
          <ArrowRight className="h-4 w-4" />
          كل المجموعات
        </Link>

        {/* الترويسة */}
        <header className="rounded-2xl border border-rule bg-paper-2/50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold">{group.name}</h1>
                {group.privacy === "private" ? (
                  <Lock className="h-4 w-4 text-ink-soft" aria-label="خاصة" />
                ) : (
                  <Globe className="h-4 w-4 text-ink-soft" aria-label="عامة" />
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                <span className="rounded-full bg-marker/10 px-2 py-0.5 font-semibold text-marker">{KIND_AR[group.kind] ?? group.kind}</span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {group.member_count} عضو
                </span>
                {(group.faculty || group.university) && <span>{group.faculty ?? group.university}</span>}
                {group.major && <span>· {group.major}</span>}
                {group.year && <span>· دفعة {group.year}</span>}
              </div>
              {group.description && <p className="mt-2 text-sm leading-relaxed text-ink">{group.description}</p>}
            </div>
            <div className="shrink-0">
              {my.status === "approved" ? (
                my.role === "owner" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-paper-2 px-3 py-1.5 text-sm font-semibold text-ink-soft">
                    <Crown className="h-4 w-4" />
                    صاحب المجموعة
                  </span>
                ) : (
                  <button className={ghostBtn} disabled={busy} onClick={() => void membershipAction("leave")}>
                    مغادرة المجموعة
                  </button>
                )
              ) : my.status === "pending" ? (
                <button className={ghostBtn} disabled={busy} onClick={() => void membershipAction("cancel")}>
                  إلغاء طلب الانضمام
                </button>
              ) : (
                <button className={primaryBtn} disabled={busy} onClick={() => void membershipAction("join")}>
                  <UserPlus className="h-4 w-4" />
                  {group.privacy === "private" ? "طلب انضمام" : "انضمام للمجموعة"}
                </button>
              )}
            </div>
          </div>
        </header>

        {actionError && (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-600" role="alert">
            {actionError}
          </div>
        )}

        {/* طلبات الانضمام — للمشرفين */}
        {isModerator && requests.length > 0 && (
          <section className="mt-5 rounded-2xl border border-rule bg-paper-2/50 p-4">
            <h2 className="mb-3 text-sm font-bold text-ink-soft">طلبات الانضمام ({requests.length})</h2>
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.user_id} className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-paper px-3 py-2">
                  <Link href={r.public_user_code ? `/u/${r.public_user_code}` : "#"} className="flex min-w-0 items-center gap-2">
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-paper-3">
                      {r.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.avatar_url} alt={r.display_name ?? ""} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-ink-soft">
                          {(r.display_name ?? "؟").slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <span className="truncate text-sm font-semibold hover:text-marker">{r.display_name ?? "طالب Magicly"}</span>
                  </Link>
                  <div className="flex shrink-0 gap-2">
                    <button className={`${smallBtn} text-emerald-600`} disabled={busy} onClick={() => void memberAction("approve", r.user_id)}>
                      <Check className="h-3.5 w-3.5" />
                      قبول
                    </button>
                    <button className={`${smallBtn} text-red-600`} disabled={busy} onClick={() => void memberAction("reject", r.user_id)}>
                      <X className="h-3.5 w-3.5" />
                      رفض
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* الأعضاء */}
        <section className="mt-5">
          <h2 className="mb-3 text-sm font-bold text-ink-soft">الأعضاء</h2>
          {membersLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-ink-soft" />
            </div>
          ) : members.length === 0 ? (
            <p className="rounded-xl border border-dashed border-rule px-4 py-6 text-center text-sm text-ink-soft">
              {group.limited ? "الأعضاء ظاهرون للأعضاء فقط في المجموعات الخاصة." : "مفيش أعضاء لسه."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <div key={m.user_id} className="inline-flex items-center gap-2 rounded-full border border-rule bg-paper-2 py-1 pl-3 pr-1.5">
                  <Link href={m.public_user_code ? `/u/${m.public_user_code}` : "#"} className="flex items-center gap-2">
                    <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-paper-3">
                      {m.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.avatar_url} alt={m.display_name ?? ""} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-ink-soft">
                          {(m.display_name ?? "؟").slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <span className="text-sm font-semibold hover:text-marker">{m.display_name ?? "طالب"}</span>
                  </Link>
                  {m.role === "owner" && <Crown className="h-3.5 w-3.5 text-amber-500" aria-label="صاحب المجموعة" />}
                  {m.role === "moderator" && <Shield className="h-3.5 w-3.5 text-marker" aria-label="مشرف" />}
                  {isModerator && m.role === "member" && (
                    <button
                      className="ml-1 rounded-full p-1 text-ink-soft transition hover:bg-danger/10 hover:text-red-600"
                      aria-label="إزالة العضو"
                      disabled={busy}
                      onClick={() => void memberAction("remove", m.user_id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* منشورات المجموعة — للأعضاء فقط */}
        {canPost ? (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-bold text-ink-soft">منشورات المجموعة</h2>

            {/* محرر */}
            <div className="mb-4 rounded-2xl border border-rule bg-paper-2/50 p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {Object.entries(POST_KIND_AR).map(([id, label]) => (
                  <button
                    key={id}
                    className={`${smallBtn} ${postKind === id ? "border-marker text-marker" : ""}`}
                    onClick={() => setPostKind(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <textarea
                className={inputCls}
                placeholder="شارك فكرتك مع أعضاء المجموعة…"
                value={postBody}
                onChange={(e) => setPostBody(e.target.value)}
                rows={3}
                maxLength={2000}
              />
              {postImage && (
                <div className="relative mt-2 w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={postImage} alt="صورة المنشور" className="max-h-40 rounded-xl" />
                  <button
                    className="absolute -left-2 -top-2 rounded-full bg-danger p-1 text-white"
                    onClick={() => setPostImage(null)}
                    aria-label="إزالة الصورة"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {publishError && <p className="mt-2 text-sm text-red-600">{publishError}</p>}
              <div className="mt-2 flex items-center justify-between">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadImage(f);
                    e.target.value = "";
                  }}
                />
                <button className={smallBtn} disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  صورة
                </button>
                <button className={primaryBtn} disabled={publishing || !postBody.trim()} onClick={() => void publish()}>
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  نشر
                </button>
              </div>
            </div>

            {/* الفيد */}
            {feedLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-ink-soft" />
              </div>
            ) : posts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-rule px-4 py-8 text-center text-sm text-ink-soft">
                أول منشور في المجموعة يبقى منك — شارع المجموعة بحاجة لتفاعل!
              </p>
            ) : (
              <div className="space-y-3">
                {posts.map((p) => (
                  <PostCard key={p.post_id} post={p} currentUserId={currentUserId} onDeleted={(postId) => setPosts((prev) => prev.filter((x) => x.post_id !== postId))} />
                ))}
              </div>
            )}
          </section>
        ) : (
          !group.limited && (
            <p className="mt-6 rounded-xl border border-dashed border-rule px-4 py-8 text-center text-sm text-ink-soft">
              انضم للمجموعة عشان تشوف منشوراتها.
            </p>
          )
        )}
      </div>
    </div>
  );
}
