"use client";

// ===========================================================================
// MAGICLY — Community C2: صفحة هاشتاج
// ===========================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Hash } from "lucide-react";
import type { CommunityPostRow } from "@/lib/community/types";
import PostCard from "@/components/community/PostCard";

export default function HashtagPage({ params }: { params: Promise<{ tag: string }> }) {
  const [tag, setTag] = useState<string | null>(null);
  const [posts, setPosts] = useState<CommunityPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [before, setBefore] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    void params.then((p) => setTag(decodeURIComponent(p.tag).replace(/^#/, "")));
  }, [params]);

  const load = useCallback(async (t: string, b?: string | null, append = false) => {
    setLoading(true);
    try {
      const url = `/api/community/hashtags/${encodeURIComponent(t)}${b ? `?before=${encodeURIComponent(b)}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      const rows: CommunityPostRow[] = data.success ? data.posts || [] : [];
      setPosts((prev) => (append ? [...prev, ...rows] : rows));
      if (rows.length < 20) setDone(true);
      else setBefore(rows[rows.length - 1]?.created_at ?? null);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tag) return;
    void load(tag, null, false);
    void fetch("/api/community/profile")
      .then((r) => r.json())
      .then((d) => d.success && d.profile?.user_id && setCurrentUserId(d.profile.user_id))
      .catch(() => undefined);
  }, [tag, load]);

  return (
    <main className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-5 sm:py-8" dir="rtl">
      <header className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-marker/10">
          <Hash className="h-5 w-5 text-marker" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-ink">#{tag ?? "..."}</h1>
          <Link href="/community" className="text-xs text-ink-soft hover:text-marker">
            ← رجوع لمجتمع Magicly
          </Link>
        </div>
      </header>

      {loading && posts.length === 0 ? (
        <p className="text-sm text-ink-soft">جارٍ التحميل...</p>
      ) : posts.length === 0 ? (
        <p className="rounded-xl border border-rule bg-paper-2 px-4 py-6 text-center text-sm text-ink-soft">
          مفيش منشورات بالهاشتاج ده لسه.
        </p>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <PostCard key={p.post_id} post={p} currentUserId={currentUserId} onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.post_id !== id))} />
          ))}
          {!done && before && (
            <button onClick={() => tag && void load(tag, before, true)} className="mx-auto block rounded-lg border border-rule px-4 py-2 text-sm font-semibold text-ink hover:bg-paper-2">
              تحميل المزيد
            </button>
          )}
        </div>
      )}
    </main>
  );
}
