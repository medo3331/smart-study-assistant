"use client";

// ===========================================================================
// MAGICLY — شريط الحالات (ستوريز) — زي واتساب/انستجرام
// ---------------------------------------------------------------------------
// - دايرة لكل مستخدم عنده حالة نشطة (تنتهي بعد 24 ساعة)
// - «حالتك» بدايرة + لمشاهدة حالتك أو إنشاء حالة جديدة (صورة + كابشن)
// - المشاهد: Modal بتنقل بين الحالات + حذف حالتي
// ===========================================================================

import { useCallback, useEffect, useState } from "react";
import { X, Plus, Trash2, Loader2 } from "lucide-react";

type Story = {
  id: string;
  user_id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
};

type StoryGroup = { user_id: string; display_name: string | null; handle: string | null; avatar_url: string | null; stories: Story[] };

export default function StoriesBar() {
  const [mine, setMine] = useState<StoryGroup | null>(null);
  const [others, setOthers] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // المشاهد
  const [viewerGroup, setViewerGroup] = useState<StoryGroup | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  // إنشاء حالة
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [storyError, setStoryError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/community/stories");
      if (res.status === 401) return;
      const data = await res.json();
      if (data.success) {
        setMine(data.mine ?? null);
        setOthers(data.others ?? []);
      }
    } catch { /* تجاهل */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pickFile = async (file: File) => {
    setCreating(true);
    setUploading(true);
    setStoryError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/conversations/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) {
        setStoryError(data.error || "تعذّر رفع الصورة.");
        return;
      }
      setPendingUrl(data.url);
    } catch {
      setStoryError("مشكلة شبكة — حاول تاني.");
    } finally {
      setUploading(false);
    }
  };

  const publishStory = async () => {
    if (!pendingUrl) return;
    setUploading(true);
    setStoryError(null);
    try {
      const res = await fetch("/api/community/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_url: pendingUrl, media_type: "image", caption: caption.trim() || undefined }),
      });
      const data = await res.json();
      if (!data.success) {
        setStoryError(data.error || "تعذّر نشر الحالة.");
        return;
      }
      setPendingUrl(null);
      setCaption("");
      setCreating(false);
      void load();
    } catch {
      setStoryError("مشكلة شبكة — حاول تاني.");
    } finally {
      setUploading(false);
    }
  };

  const deleteStory = async (id: string) => {
    try {
      await fetch(`/api/community/stories?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setMine((prev) => {
        if (!prev) return prev;
        const stories = prev.stories.filter((s) => s.id !== id);
        return stories.length ? { ...prev, stories } : null;
      });
      setViewerGroup((prev) => {
        if (!prev) return prev;
        const stories = prev.stories.filter((s) => s.id !== id);
        if (!stories.length) return null;
        return { ...prev, stories };
      });
      setViewerIndex(0);
    } catch { /* تجاهل */ }
  };

  const openGroup = (g: StoryGroup) => { setViewerGroup(g); setViewerIndex(0); };

  const avatarEl = (url: string | null, name: string | null, cls: string, ring: string) =>
    url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className={`${cls} ${ring} shrink-0 rounded-full object-cover`} />
    ) : (
      <div className={`${cls} ${ring} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-marker to-amber-600 font-bold text-white`}>
        {(name ?? "؟").trim().charAt(0)}
      </div>
    );

  const current = viewerGroup?.stories[viewerIndex] ?? null;

  return (
    <div className="rounded-2xl border border-rule bg-paper-2 p-3">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {/* حالتي — إنشاء أو مشاهدة */}
        <button
          onClick={() => (mine ? openGroup(mine) : setCreating(true))}
          className="flex w-16 shrink-0 flex-col items-center gap-1"
        >
          <span className="relative">
            {mine
              ? avatarEl(mine.avatar_url, mine.display_name, "h-14 w-14 text-sm", "ring-2 ring-marker ring-offset-2 ring-offset-paper-2")
              : avatarEl(null, "أنا", "h-14 w-14 text-sm opacity-60", "")}
            <span className="absolute -bottom-0.5 -left-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-marker text-white shadow">
              <Plus className="h-3 w-3" />
            </span>
          </span>
          <span className="w-full truncate text-center text-[11px] font-semibold text-ink">{mine ? "حالتك" : "أضف حالة"}</span>
        </button>

        {loading ? (
          <div className="flex items-center px-4 text-xs text-slate-400"><Loader2 className="ml-1 inline h-4 w-4 animate-spin" /> جارٍ التحميل…</div>
        ) : others.length === 0 ? (
          <p className="flex items-center px-4 text-xs text-slate-400">مفيش حالات لسه — كن أول من ينشر حالة (بتختفي بعد 24 ساعة).</p>
        ) : (
          others.map((g) => (
            <button key={g.user_id} onClick={() => openGroup(g)} className="flex w-16 shrink-0 flex-col items-center gap-1">
              {avatarEl(g.avatar_url, g.display_name, "h-14 w-14 text-sm", "ring-2 ring-emerald-500 ring-offset-2 ring-offset-paper-2")}
              <span className="w-full truncate text-center text-[11px] font-semibold text-ink">{g.display_name || "طالب"}</span>
            </button>
          ))
        )}
      </div>

      {/* -------------------------------------------------- نافذة إنشاء حالة */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-paper p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-ink">حالة جديدة</h3>
              <button onClick={() => { setCreating(false); setPendingUrl(null); setCaption(""); }} className="rounded-lg p-1.5 hover:bg-paper-2" aria-label="إغلاق">
                <X className="h-5 w-5 text-ink-soft" />
              </button>
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              id="story-media-input"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); e.target.value = ""; }}
            />
            {pendingUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pendingUrl} alt="الحالة" className="mb-3 max-h-64 w-full rounded-xl object-cover" />
            ) : (
              <button
                onClick={() => document.getElementById("story-media-input")?.click()}
                disabled={uploading}
                className="mb-3 flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-rule text-sm text-ink-soft transition hover:border-marker hover:text-marker"
              >
                {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Plus className="h-6 w-6" />}
                اختار صورة (بتظهر 24 ساعة)
              </button>
            )}
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="كابشن (اختياري)…"
              maxLength={300}
              className="mb-3 w-full rounded-xl border border-rule/50 bg-paper-2/50 px-3 py-2.5 text-sm text-ink outline-none focus:border-marker"
            />
            {storyError && (
              <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{storyError}</p>
            )}
            <button
              onClick={() => void publishStory()}
              disabled={!pendingUrl || uploading}
              className="w-full rounded-xl bg-marker py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {uploading && pendingUrl ? <Loader2 className="ml-1 inline h-4 w-4 animate-spin" /> : null}
              نشر الحالة
            </button>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- نافذة المشاهد */}
      {viewerGroup && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {avatarEl(viewerGroup.avatar_url, viewerGroup.display_name, "h-9 w-9 text-xs", "")}
                <div>
                  <p className="text-sm font-bold text-white">{viewerGroup.display_name || "طالب"}</p>
                  <p className="text-[11px] text-white/60">
                    {new Date(current.created_at).toLocaleString("ar-EG", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                  </p>
                </div>
              </div>
              <button onClick={() => setViewerGroup(null)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="إغلاق">
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.media_url} alt="حالة" className="max-h-[70vh] w-full rounded-2xl object-contain" />
            {current.caption && (
              <p className="mt-2 rounded-xl bg-black/40 px-3 py-2 text-center text-sm text-white">{current.caption}</p>
            )}
            <div className="mt-3 flex items-center justify-between">
              <div className="flex gap-1.5">
                {viewerGroup.stories.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setViewerIndex(i)}
                    className={`h-1.5 w-6 rounded-full ${i === viewerIndex ? "bg-white" : "bg-white/30"}`}
                    aria-label={`حالة ${i + 1}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                {viewerIndex < viewerGroup.stories.length - 1 ? (
                  <button onClick={() => setViewerIndex((i) => i + 1)} className="rounded-xl bg-white/20 px-4 py-2 text-xs font-bold text-white hover:bg-white/30">التالي</button>
                ) : null}
                {current.user_id === mine?.user_id && (
                  <button onClick={() => void deleteStory(current.id)} className="flex items-center gap-1 rounded-xl bg-rose-600/80 px-3 py-2 text-xs font-bold text-white hover:bg-rose-600">
                    <Trash2 className="h-3.5 w-3.5" /> حذف
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
