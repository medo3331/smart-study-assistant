"use client";

// ===========================================================================
// MAGICLY — Community C1: مركز الاكتشاف والعلاقات
// ===========================================================================
// تابات: اكتشف (بحث + اقتراحات) · الأصدقاء · الطلبات · ملفي
// كل الإجراءات عبر /api/community/* والـRPCs بتفرض الخصوصية والحظر سيرفر سايد.
// ===========================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, UserPlus, Users, Bell, User as UserIcon, Trophy, Check, X, MessageCircle, Rss, Bookmark, ImagePlus, Loader2 } from "lucide-react";
import type { SocialProfileSummary, CommunityPostRow } from "@/lib/community/types";
import { relationErrorAr, postErrorAr, POST_KIND_AR } from "@/lib/community/types";
import PostCard from "@/components/community/PostCard";

type FriendRow = {
  friend_id: string;
  display_name: string | null;
  avatar_url: string | null;
  public_user_code: string | null;
  friends_since: string;
};

type RequestRow = {
  request_id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  public_user_code: string | null;
  created_at: string;
};

type SocialProfile = {
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  university: string | null;
  faculty: string | null;
  major: string | null;
  year: string | null;
  interests: string[] | null;
  account_privacy: "public" | "private";
  allow_friend_requests: boolean;
  allow_messages: boolean;
  show_academic_info: boolean;
};

type Tab = "feed" | "discover" | "friends" | "requests" | "saved" | "profile";

const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
const primaryBtn = `${btn} bg-marker text-white hover:opacity-90`;
const ghostBtn = `${btn} border border-rule text-ink hover:bg-paper-2`;
const smallBtn = "inline-flex items-center gap-1.5 rounded-lg border border-rule px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-paper-2 disabled:opacity-50";
const inputCls = "w-full rounded-xl border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-marker";

const TABS: { id: Tab; label: string; icon: typeof Search }[] = [
  { id: "feed", label: "الفيد", icon: Rss },
  { id: "discover", label: "اكتشف", icon: Search },
  { id: "friends", label: "الأصدقاء", icon: Users },
  { id: "requests", label: "الطلبات", icon: Bell },
  { id: "saved", label: "المحفوظات", icon: Bookmark },
  { id: "profile", label: "ملفي", icon: UserIcon },
];

export default function CommunityHubPage() {
  const [tab, setTab] = useState<Tab>("feed");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // feed
  const [feed, setFeed] = useState<CommunityPostRow[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedBefore, setFeedBefore] = useState<string | null>(null);
  const [feedDone, setFeedDone] = useState(false);
  // composer
  const [postKind, setPostKind] = useState("text");
  const [postVisibility, setPostVisibility] = useState("public");
  const [postBody, setPostBody] = useState("");
  const [postImage, setPostImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // saved
  const [savedPosts, setSavedPosts] = useState<CommunityPostRow[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  // discover
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SocialProfileSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<SocialProfileSummary[]>([]);
  const [requested, setRequested] = useState<Record<string, "sent" | "error">>({});

  // friends & requests
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [incoming, setIncoming] = useState<RequestRow[]>([]);
  const [outgoing, setOutgoing] = useState<RequestRow[]>([]);
  const [relationsLoading, setRelationsLoading] = useState(false);

  // profile editor
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [interestsText, setInterestsText] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  const loadRelations = useCallback(async () => {
    setRelationsLoading(true);
    try {
      const res = await fetch("/api/community/friends");
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      setAuthed(true);
      const data = await res.json();
      if (data.success) {
        setFriends(data.friends || []);
        setIncoming(data.incoming || []);
        setOutgoing(data.outgoing || []);
      }
    } catch {
      setActionError("مشكلة شبكة — حاول تاني.");
    } finally {
      setRelationsLoading(false);
    }
  }, []);

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/community/suggestions");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setSuggestions(data.suggestions || []);
    } catch {
      // الاقتراحات ليست حرجة — نتجاهل الفشل بصمت
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/community/profile");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.profile) {
        setProfile(data.profile);
        if (data.profile.user_id) setCurrentUserId(data.profile.user_id);
        setInterestsText((data.profile.interests || []).join("، "));
      }
    } catch {
      // تجاهل
    }
  }, []);

  const loadFeed = useCallback(async (before?: string | null, append = false) => {
    setFeedLoading(true);
    try {
      const url = `/api/community/posts${before ? `?before=${encodeURIComponent(before)}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      const posts: CommunityPostRow[] = data.success ? data.posts || [] : [];
      setFeed((prev) => (append ? [...prev, ...posts] : posts));
      if (posts.length < 20) setFeedDone(true);
      else setFeedBefore(posts[posts.length - 1]?.created_at ?? null);
    } catch {
      setFeed([]);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    try {
      const res = await fetch("/api/community/saved-posts");
      const data = await res.json();
      setSavedPosts(data.success ? data.posts || [] : []);
    } catch {
      setSavedPosts([]);
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "feed" && feed.length === 0 && !feedDone) void loadFeed(null, false);
    if (tab === "saved" && savedPosts.length === 0) void loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const uploadImage = async (file: File) => {
    setUploading(true);
    setPublishError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/community/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) setPostImage(data.url);
      else setPublishError(data.error || "تعذّر رفع الصورة.");
    } catch {
      setPublishError("مشكلة شبكة أثناء رفع الصورة.");
    } finally {
      setUploading(false);
    }
  };

  const publish = async () => {
    const body = postBody.trim();
    if (!body || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: postKind, body, visibility: postVisibility, imageUrl: postImage }),
      });
      const data = await res.json();
      if (data.success) {
        setPostBody("");
        setPostImage(null);
        setPostKind("text");
        setFeedDone(false);
        await loadFeed(null, false);
      } else {
        setPublishError(postErrorAr(data.code, data.error || "تعذّر النشر."));
      }
    } catch {
      setPublishError("مشكلة شبكة — حاول تاني.");
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    void loadRelations();
    void loadSuggestions();
    void loadProfile();
  }, [loadRelations, loadSuggestions, loadProfile]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/users/search?query=${encodeURIComponent(q)}&limit=20`);
      const data = await res.json();
      setResults(data.success ? data.profiles || [] : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const sendFriendRequest = async (targetId: string) => {
    setActionError(null);
    try {
      const res = await fetch("/api/community/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", target: targetId }),
      });
      const data = await res.json();
      if (data.ok === false) {
        setRequested((prev) => ({ ...prev, [targetId]: "error" }));
        setActionError(relationErrorAr(data.code, data.error || "تعذّر إرسال الطلب."));
      } else {
        setRequested((prev) => ({ ...prev, [targetId]: "sent" }));
        void loadSuggestions();
      }
    } catch {
      setActionError("مشكلة شبكة — حاول تاني.");
    }
  };

  const friendAction = async (
    action: "accept" | "reject" | "cancel" | "remove",
    payload: { requestId?: string; target?: string },
  ) => {
    setActionError(null);
    try {
      const res = await fetch("/api/community/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (data.ok === false) {
        setActionError(relationErrorAr(data.code, data.error || "تعذّر تنفيذ الإجراء."));
      }
      await loadRelations();
    } catch {
      setActionError("مشكلة شبكة — حاول تاني.");
    }
  };

  const startChat = async (targetId: string) => {
    setActionError(null);
    try {
      const res = await fetch("/api/messages/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiver_profile_id: targetId, note: "" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "تعذّر بدء المحادثة.");
        return;
      }
      window.location.href = "/inbox";
    } catch {
      setActionError("مشكلة شبكة — حاول تاني.");
    }
  };

  const saveProfile = async () => {
    if (!profile) return;
    setSavingProfile(true);
    setProfileSaved(false);
    setProfileError(null);
    try {
      const interests = interestsText
        .split(/[,،]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/community/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, interests }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setProfileError(data.error || "تعذّر الحفظ.");
      } else {
        setProfileSaved(true);
        void loadProfile();
      }
    } catch {
      setProfileError("مشكلة شبكة — حاول تاني.");
    } finally {
      setSavingProfile(false);
    }
  };

  if (authed === false) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center" dir="rtl">
        <Users className="mx-auto mb-4 h-12 w-12 text-ink-soft" />
        <h1 className="text-2xl font-extrabold text-ink">مجتمع Magicly</h1>
        <p className="mt-2 text-sm text-ink-soft">
          سجّل دخولك عشان تلاقي زمايلك، تبعت طلبات صداقة، وتتابع طلاب في نفس مجالك.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/login?next=/community" className={primaryBtn}>
            تسجيل الدخول
          </Link>
          <Link href="/community/competitions" className={ghostBtn}>
            تحديات المجتمع
          </Link>
        </div>
      </main>
    );
  }

  const pendingCount = incoming.length;

  return (
    <main className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-5 sm:py-8" dir="rtl">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">مجتمع Magicly</h1>
          <p className="mt-1 text-sm text-ink-soft">
            لاقي زمايلك في نفس جامعتك وتخصصك — أصدقاء، متابعة، واكتشاف طلاب بيذاكروا زيّك.
          </p>
        </div>
        <Link
          href="/community/competitions"
          className="inline-flex items-center gap-2 rounded-full border border-rule bg-paper-2 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-paper/50"
        >
          <Trophy className="h-4 w-4" />
          التحديات والمسابقات
        </Link>
      </header>

      {actionError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-600" role="alert">
          {actionError}
        </div>
      )}

      <nav className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="أقسام المجتمع">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === id
                ? "bg-marker text-white"
                : "border border-rule bg-paper-2 text-ink hover:bg-paper/50"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {id === "requests" && pendingCount > 0 && (
              <span className="rounded-full bg-danger px-1.5 text-xs font-bold text-white">{pendingCount}</span>
            )}
          </button>
        ))}
      </nav>

      {/* -------------------------------------------------------- الفيد --- */}
      {tab === "feed" && (
        <section className="space-y-4">
          {/* الكومبوزر */}
          <div className="rounded-2xl border border-rule bg-paper-2 p-4">
            <textarea
              value={postBody}
              onChange={(e) => setPostBody(e.target.value)}
              placeholder="ايه اللي في بالك؟ شارك إنجازك، اسأل سؤال، أو اكتب معلومة تفيد زمايلك... (#هاشتاج و@MAG-XXX-XXXX مدعومين)"
              className={`${inputCls} min-h-24 resize-y`}
              maxLength={2000}
              aria-label="منشور جديد"
            />
            {postImage && (
              <div className="relative mt-3 inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={postImage} alt="" className="max-h-40 rounded-xl" />
                <button
                  onClick={() => setPostImage(null)}
                  aria-label="إزالة الصورة"
                  className="absolute left-1 top-1 rounded-full bg-black/60 p-1 text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select value={postKind} onChange={(e) => setPostKind(e.target.value)} className={`${inputCls} w-auto`} aria-label="نوع المنشور">
                {Object.entries(POST_KIND_AR).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
              <select value={postVisibility} onChange={(e) => setPostVisibility(e.target.value)} className={`${inputCls} w-auto`} aria-label="من يشوف المنشور">
                <option value="public">🌍 عام</option>
                <option value="friends">👥 الأصدقاء فقط</option>
                <option value="private">🔒 خاص بي</option>
              </select>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rule px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-paper-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                صورة
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadImage(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button onClick={() => void publish()} disabled={publishing || !postBody.trim()} className={primaryBtn}>
                {publishing ? "جارٍ النشر..." : "نشر"}
              </button>
            </div>
            {publishError && <p className="mt-2 text-xs text-red-600">{publishError}</p>}
          </div>

          {/* المنشورات */}
          {feedLoading && feed.length === 0 ? (
            <p className="rounded-xl border border-rule bg-paper-2 px-4 py-6 text-center text-sm text-ink-soft">
              جارٍ تحميل الفيد...
            </p>
          ) : feed.length === 0 ? (
            <p className="rounded-xl border border-rule bg-paper-2 px-4 py-6 text-center text-sm text-ink-soft">
              الفيد فاضي لسه — انشر أول منشور، أو ضيف أصدقاء من تاب «اكتشف» عشان تشوف منشوراتهم هنا.
            </p>
          ) : (
            <>
              {feed.map((p) => (
                <PostCard
                  key={p.post_id}
                  post={p}
                  currentUserId={currentUserId}
                  onDeleted={(id) => setFeed((prev) => prev.filter((x) => x.post_id !== id))}
                />
              ))}
              {!feedDone && feedBefore && (
                <button
                  onClick={() => void loadFeed(feedBefore, true)}
                  disabled={feedLoading}
                  className={`${ghostBtn} mx-auto block`}
                >
                  {feedLoading ? "جارٍ التحميل..." : "تحميل المزيد"}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {/* --------------------------------------------------- المحفوظات --- */}
      {tab === "saved" && (
        <section>
          {savedLoading ? (
            <p className="text-sm text-ink-soft">جارٍ التحميل...</p>
          ) : savedPosts.length === 0 ? (
            <p className="rounded-xl border border-rule bg-paper-2 px-4 py-6 text-center text-sm text-ink-soft">
              مفيش منشورات محفوظة — اضغط «حفظ» على أي منشور في الفيد.
            </p>
          ) : (
            <div className="space-y-4">
              {savedPosts.map((p) => (
                <PostCard
                  key={p.post_id}
                  post={p}
                  currentUserId={currentUserId}
                  onDeleted={(id) => setSavedPosts((prev) => prev.filter((x) => x.post_id !== id))}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------------- اكتشف --- */}
      {tab === "discover" && (
        <section>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
            className="mb-4 flex gap-2"
            role="search"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو كود MAG (مثال: MAG-ABC-1234)..."
              className="w-full rounded-xl border border-rule bg-paper-2 px-4 py-2.5 text-sm text-ink outline-none focus:border-marker"
              aria-label="بحث عن الطلاب"
            />
            <button type="submit" className={primaryBtn} disabled={searching}>
              {searching ? "جارٍ البحث..." : "بحث"}
            </button>
          </form>

          {results.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {results.map((p) => (
                <PersonCard
                  key={p.profile_id}
                  id={p.profile_id}
                  name={p.display_name}
                  avatarUrl={p.avatar_url}
                  subtitle={[p.university, p.faculty].filter(Boolean).join(" — ") || null}
                  bio={p.is_visible ? p.bio : null}
                  note={p.is_visible ? null : "حساب خاص — البيانات المختصرة فقط"}
                  action={
                    requested[p.profile_id] === "sent" ? (
                      <span className="text-xs font-semibold text-emerald-600">تم إرسال الطلب ✓</span>
                    ) : requested[p.profile_id] === "error" ? (
                      <span className="text-xs font-semibold text-red-600">حاول تاني</span>
                    ) : (
                      <button onClick={() => void sendFriendRequest(p.profile_id)} className={smallBtn}>
                        <UserPlus className="h-3.5 w-3.5" />
                        إضافة صديق
                      </button>
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <>
              <h2 className="mb-3 text-lg font-bold text-ink">اقتراحات ليك</h2>
              {suggestions.length === 0 ? (
                <p className="rounded-xl border border-rule bg-paper-2 px-4 py-6 text-center text-sm text-ink-soft">
                  مفيش اقتراحات حاليًا — املأ بياناتك الأكاديمية في تاب «ملفي» عشان نقترحلك طلاب من نفس جامعتك وتخصصك.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {suggestions.map((p) => (
                    <PersonCard
                      key={p.profile_id}
                      id={p.profile_id}
                      name={p.display_name}
                      avatarUrl={p.avatar_url}
                      subtitle={[p.university, p.faculty, p.specialization].filter(Boolean).join(" — ") || null}
                      bio={p.is_visible ? p.bio : null}
                      action={
                        requested[p.profile_id] === "sent" ? (
                          <span className="text-xs font-semibold text-emerald-600">تم إرسال الطلب ✓</span>
                        ) : (
                          <button onClick={() => void sendFriendRequest(p.profile_id)} className={smallBtn}>
                            <UserPlus className="h-3.5 w-3.5" />
                            إضافة صديق
                          </button>
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ---------------------------------------------------- الأصدقاء --- */}
      {tab === "friends" && (
        <section>
          {relationsLoading ? (
            <p className="text-sm text-ink-soft">جارٍ التحميل...</p>
          ) : friends.length === 0 ? (
            <p className="rounded-xl border border-rule bg-paper-2 px-4 py-6 text-center text-sm text-ink-soft">
              لسه مفيش أصدقاء — ابدأ من تاب «اكتشف» وابعت طلبات صداقة.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {friends.map((f) => (
                <PersonCard
                  key={f.friend_id}
                  id={f.friend_id}
                  name={f.display_name}
                  avatarUrl={f.avatar_url}
                  magCode={f.public_user_code}
                  action={
                    <div className="flex gap-2">
                      <button onClick={() => void startChat(f.friend_id)} className={smallBtn}>
                        <MessageCircle className="h-3.5 w-3.5" />
                        محادثة
                      </button>
                      <button
                        onClick={() => void friendAction("remove", { target: f.friend_id })}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-soft hover:text-red-600"
                      >
                        إزالة
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ----------------------------------------------------- الطلبات --- */}
      {tab === "requests" && (
        <section className="space-y-6">
          <div>
            <h2 className="mb-3 text-lg font-bold text-ink">طلبات واردة ({incoming.length})</h2>
            {incoming.length === 0 ? (
              <p className="rounded-xl border border-rule bg-paper-2 px-4 py-4 text-center text-sm text-ink-soft">
                مفيش طلبات واردة.
              </p>
            ) : (
              <div className="space-y-2">
                {incoming.map((r) => (
                  <div
                    key={r.request_id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-paper-2 px-4 py-3"
                  >
                    <PersonInline name={r.display_name} magCode={r.public_user_code} userId={r.user_id} />
                    <div className="flex gap-2">
                      <button
                        onClick={() => void friendAction("accept", { requestId: r.request_id })}
                        className={`${smallBtn} !bg-emerald-600 !text-white`}
                      >
                        <Check className="h-3.5 w-3.5" />
                        قبول
                      </button>
                      <button
                        onClick={() => void friendAction("reject", { requestId: r.request_id })}
                        className="rounded-lg border border-rule px-3 py-1 text-xs font-semibold text-ink-soft hover:text-red-600"
                      >
                        <X className="ml-1 inline h-3.5 w-3.5" />
                        رفض
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h2 className="mb-3 text-lg font-bold text-ink">طلبات أرسلتها ({outgoing.length})</h2>
            {outgoing.length === 0 ? (
              <p className="rounded-xl border border-rule bg-paper-2 px-4 py-4 text-center text-sm text-ink-soft">
                مفيش طلبات معلّقة.
              </p>
            ) : (
              <div className="space-y-2">
                {outgoing.map((r) => (
                  <div
                    key={r.request_id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-paper-2 px-4 py-3"
                  >
                    <PersonInline name={r.display_name} magCode={r.public_user_code} userId={r.user_id} />
                    <button
                      onClick={() => void friendAction("cancel", { requestId: r.request_id })}
                      className="text-xs font-semibold text-ink-soft hover:text-red-600"
                    >
                      إلغاء الطلب
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* -------------------------------------------------------- ملفي --- */}
      {tab === "profile" && (
        <section className="mx-auto max-w-2xl">
          {!profile ? (
            <p className="text-sm text-ink-soft">جارٍ تحميل ملفك...</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveProfile();
              }}
              className="space-y-4 rounded-2xl border border-rule bg-paper-2 p-5"
            >
              <Field label="الاسم الظاهر">
                <input
                  value={profile.display_name ?? ""}
                  onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                  className={inputCls}
                  maxLength={60}
                />
              </Field>
              <Field label="نبذة عنك">
                <textarea
                  value={profile.bio ?? ""}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  className={`${inputCls} min-h-24`}
                  maxLength={500}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="الجامعة">
                  <input value={profile.university ?? ""} onChange={(e) => setProfile({ ...profile, university: e.target.value })} className={inputCls} />
                </Field>
                <Field label="الكلية">
                  <input value={profile.faculty ?? ""} onChange={(e) => setProfile({ ...profile, faculty: e.target.value })} className={inputCls} />
                </Field>
                <Field label="التخصص">
                  <input value={profile.major ?? ""} onChange={(e) => setProfile({ ...profile, major: e.target.value })} className={inputCls} />
                </Field>
                <Field label="السنة الدراسية">
                  <input value={profile.year ?? ""} onChange={(e) => setProfile({ ...profile, year: e.target.value })} className={inputCls} />
                </Field>
              </div>
              <Field label="الاهتمامات (افصل بينهم بفاصلة)">
                <input value={interestsText} onChange={(e) => setInterestsText(e.target.value)} className={inputCls} />
              </Field>
              <Field label="خصوصية الحساب">
                <select
                  value={profile.account_privacy}
                  onChange={(e) => setProfile({ ...profile, account_privacy: e.target.value as "public" | "private" })}
                  className={inputCls}
                >
                  <option value="public">عام — الطلاب يقدروا يلاقوك ويتابعوك</option>
                  <option value="private">خاص — طلب صداقة قبل الوصول لبياناتك</option>
                </select>
              </Field>
              <div className="space-y-2 rounded-xl bg-paper/40 p-3">
                <Toggle
                  label="السماح بطلبات الصداقة"
                  checked={profile.allow_friend_requests}
                  onChange={(v) => setProfile({ ...profile, allow_friend_requests: v })}
                />
                <Toggle
                  label="السماح بمراسلتك"
                  checked={profile.allow_messages}
                  onChange={(v) => setProfile({ ...profile, allow_messages: v })}
                />
                <Toggle
                  label="إظهار بياناتي الأكاديمية (الجامعة/الكلية/التخصص)"
                  checked={profile.show_academic_info}
                  onChange={(v) => setProfile({ ...profile, show_academic_info: v })}
                />
              </div>
              {profileError && <p className="text-sm text-red-600">{profileError}</p>}
              {profileSaved && <p className="text-sm text-emerald-600">تم الحفظ ✓</p>}
              <button type="submit" className={primaryBtn} disabled={savingProfile}>
                {savingProfile ? "جارٍ الحفظ..." : "حفظ التغييرات"}
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- helpers ---

function PersonCard({
  id,
  name,
  avatarUrl,
  magCode,
  subtitle,
  bio,
  note,
  action,
}: {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  magCode?: string | null;
  subtitle?: string | null;
  bio?: string | null;
  note?: string | null;
  action: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-rule bg-paper-2 p-4">
      <div className="flex items-start gap-3">
        <Avatar url={avatarUrl} name={name} />
        <div className="min-w-0 flex-1">
          <Link href={`/u/${magCode ?? id}`} className="block truncate font-bold text-ink hover:text-marker">
            {name || "طالب بدون اسم"}
          </Link>
          {magCode && <p className="text-xs text-ink-soft">{magCode}</p>}
          {subtitle && <p className="mt-0.5 truncate text-xs text-ink-soft">{subtitle}</p>}
          {bio && <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{bio}</p>}
          {note && <p className="mt-1 text-xs italic text-ink-soft">{note}</p>}
        </div>
      </div>
      <div className="mt-3">{action}</div>
    </div>
  );
}

function PersonInline({ name, magCode, userId }: { name: string | null; magCode: string | null; userId: string }) {
  return (
    <div className="flex items-center gap-2">
      <Link href={`/u/${magCode ?? userId}`} className="font-semibold text-ink hover:text-marker">
        {name || "طالب"}
      </Link>
      {magCode && <span className="text-xs text-ink-soft">{magCode}</span>}
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name || "صورة"} className="h-12 w-12 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-marker/10 text-lg font-bold text-marker">
      {(name || "؟").trim().charAt(0)}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-ink">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--primary,#6366f1)]" />
    </label>
  );
}
