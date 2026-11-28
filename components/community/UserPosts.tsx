"use client";

// ===========================================================================
// MAGICLY — Community C2: منشورات طالب (قسم في صفحة الملف /u/[code])
// ===========================================================================

import { useEffect, useState } from "react";
import { Rss } from "lucide-react";
import type { CommunityPostRow } from "@/lib/community/types";
import PostCard from "@/components/community/PostCard";

export default function UserPosts({ userId }: { userId: string }) {
  const [posts, setPosts] = useState<CommunityPostRow[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/community/users/${userId}/posts`)
      .then((r) => r.json())
      .then((d) => setPosts(d.success ? d.posts || [] : []))
      .catch(() => setPosts([]));
    void fetch("/api/community/profile")
      .then((r) => r.json())
      .then((d) => d.success && d.profile?.user_id && setCurrentUserId(d.profile.user_id))
      .catch(() => undefined);
  }, [userId]);

  if (posts === null || posts.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-ink">
        <Rss className="h-4 w-4" />
        منشوراته
      </h2>
      <div className="space-y-4">
        {posts.map((p) => (
          <PostCard
            key={p.post_id}
            post={p}
            currentUserId={currentUserId}
            onDeleted={(id) => setPosts((prev) => (prev ? prev.filter((x) => x.post_id !== id) : prev))}
          />
        ))}
      </div>
    </section>
  );
}
