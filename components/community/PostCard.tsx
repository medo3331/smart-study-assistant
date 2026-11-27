"use client";

// ===========================================================================
// MAGICLY — Community C2: كرت المنشور
// ===========================================================================
// عرض منشور مع إعجاب (optimistic) وتعليقات متداخلة وحفظ وحذف، مع تحويل
// الهاشتاجات لصفحاتها والمنشن لملفات أصحابها.
// ===========================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Bookmark, Trash2, Send, Loader2, Repeat2, Quote } from "lucide-react";
import type { CommunityCommentRow, CommunityPostRow } from "@/lib/community/types";
import { postErrorAr, POST_KIND_AR } from "@/lib/community/types";

const KIND_BADGE: Record<string, string> = {
  text: "bg-paper-3 text-ink-soft",
  achievement: "bg-amber-100 text-amber-800",
  question: "bg-indigo-100 text-indigo-800",
  tip: "bg-emerald-100 text-emerald-800",
  summary: "bg-blue-100 text-blue-800",
  challenge: "bg-purple-100 text-purple-800",
};

const VISIBILITY_LABEL: Record<string, string> = {
  public: "عام",
  friends: "الأصدقاء",
  private: "خاص",
};

/** تحويل النص: #هاشتاج → لينك، @MAG-XXX-XXXX → ملف الطالب. */
function renderBody(body: string) {
  const parts = body.split(/(#[A-Za-z0-9_\u0600-\u06FF]{1,50}|@MAG-[A-Za-z0-9]{3}-[A-Za-z0-9]{4})/g);
  return parts.map((part, i) => {
    if (part.startsWith("#") && part.length > 1) {
      return (
        <Link key={i} href={`/community/tag/${encodeURIComponent(part.slice(1))}`} className="text-marker hover:underline">
          {part}
        </Link>
      );
    }
    if (part.startsWith("@MAG-")) {
      return (
        <Link key={i} href={`/u/${part.slice(1)}`} className="text-marker font-semibold hover:underline">
          {part}
        </Link>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return new Date(iso).toLocaleDateString("ar-EG");
}

export default function PostCard({
  post,
  currentUserId,
  onDeleted,
  onQuoted,
}: {
  post: CommunityPostRow;
  currentUserId: string | null;
  onDeleted?: (postId: string) => void;
  onQuoted?: () => void;
}) {
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [saved, setSaved] = useState(post.saved_by_me);
  const [busy, setBusy] = useState(false);

  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommunityCommentRow[] | null>(null);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<CommunityCommentRow | null>(null);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // الأصل المقتبس/المعاد نشره — بيتجلب بالخصوصية المفروضة من get_post_details
  const embeddedId = post.repost_of_post_id ?? post.quote_post_id;
  const [embedded, setEmbedded] = useState<CommunityPostRow | null>(null);
  const [embeddedFailed, setEmbeddedFailed] = useState(false);

  useEffect(() => {
    if (!embeddedId || embeddedFailed) return;
    void fetch(`/api/community/posts/${embeddedId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.post) setEmbedded(d.post as CommunityPostRow);
        else setEmbeddedFailed(true);
      })
      .catch(() => setEmbeddedFailed(true));
  }, [embeddedId, embeddedFailed]);

  // الاستطلاع
  type PollOption = { option_id: string; option_text: string; position: number; vote_count: number; voted_by_me: boolean };
  const [poll, setPoll] = useState<PollOption[] | null>(null);
  useEffect(() => {
    if (post.kind !== "poll") return;
    void fetch(`/api/community/posts/${post.post_id}/poll`)
      .then((r) => r.json())
      .then((d) => d.success && setPoll(d.options || []))
      .catch(() => undefined);
  }, [post.kind, post.post_id]);

  const vote = async (optionId: string) => {
    if (poll?.some((o) => o.voted_by_me)) return; // صوّت بالفعل
    try {
      const res = await fetch(`/api/community/posts/${post.post_id}/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
      const data = await res.json();
      if (data.success) {
        const res2 = await fetch(`/api/community/posts/${post.post_id}/poll`);
        const d2 = await res2.json();
        if (d2.success) setPoll(d2.options || []);
      } else {
        setError(postErrorAr(data.code, "تعذّر التصويت."));
      }
    } catch {
      setError("مشكلة شبكة — حاول تاني.");
    }
  };

  // إعادة النشر + الاقتباس
  const [reposted, setReposted] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState("");
  const [quoting, setQuoting] = useState(false);

  const doRepost = async () => {
    if (busy || reposted) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/posts/${post.post_id}/repost`, { method: "POST" });
      const data = await res.json();
      if (data.success) setReposted(true);
      else setError(postErrorAr(data.code, "تعذّرت إعادة النشر."));
    } catch {
      setError("مشكلة شبكة — حاول تاني.");
    } finally {
      setBusy(false);
    }
  };

  const submitQuote = async () => {
    const body = quoteDraft.trim();
    if (!body || quoting) return;
    setQuoting(true);
    setError(null);
    try {
      const res = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "text", body, visibility: "public", quotePostId: post.post_id }),
      });
      const data = await res.json();
      if (data.success) {
        setShowQuote(false);
        setQuoteDraft("");
        onQuoted?.();
      } else {
        setError(postErrorAr(data.code, "تعذّر الاقتباس."));
      }
    } catch {
      setError("مشكلة شبكة — حاول تاني.");
    } finally {
      setQuoting(false);
    }
  };

  const isMine = currentUserId !== null && post.author_id === currentUserId;

  const toggleLike = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/posts/${post.post_id}/like`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setLiked(Boolean(data.liked));
        setLikeCount(Number(data.likeCount ?? 0));
      } else {
        setError(postErrorAr(data.code, "تعذّر تسجيل الإعجاب."));
      }
    } catch {
      setError("مشكلة شبكة — حاول تاني.");
    } finally {
      setBusy(false);
    }
  };

  const toggleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/community/posts/${post.post_id}/save`, { method: "POST" });
      const data = await res.json();
      if (data.success) setSaved(Boolean(data.saved));
    } catch {
      // تجاهل
    } finally {
      setBusy(false);
    }
  };

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/community/posts/${post.post_id}/comments`);
      const data = await res.json();
      setComments(data.success ? data.comments || [] : []);
    } catch {
      setComments([]);
    }
  }, [post.post_id]);

  const openComments = () => {
    setShowComments((v) => !v);
    if (!showComments && comments === null) void loadComments();
  };

  const submitComment = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/posts/${post.post_id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentId: replyTo?.comment_id ?? null }),
      });
      const data = await res.json();
      if (data.success) {
        setDraft("");
        setReplyTo(null);
        await loadComments();
        setCommentCount((c) => c + 1);
      } else {
        setError(postErrorAr(data.code, "تعذّر إضافة التعليق."));
      }
    } catch {
      setError("مشكلة شبكة — حاول تاني.");
    } finally {
      setSending(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      const res = await fetch(`/api/community/posts/${post.post_id}/comments/${commentId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setComments((cs) => (cs ? cs.filter((c) => c.comment_id !== commentId) : cs));
        setCommentCount((c) => Math.max(0, c - 1));
      }
    } catch {
      // تجاهل
    }
  };

  const deletePost = async () => {
    if (!window.confirm("متأكد إنك عايز تحذف المنشور؟")) return;
    try {
      const res = await fetch(`/api/community/posts/${post.post_id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) onDeleted?.(post.post_id);
      else setError(postErrorAr(data.code, "تعذّر الحذف."));
    } catch {
      setError("مشكلة شبكة — حاول تاني.");
    }
  };

  const topLevel = (comments ?? []).filter((c) => !c.parent_id);
  const repliesOf = (id: string) => (comments ?? []).filter((c) => c.parent_id === id);

  return (
    <article className="rounded-2xl border border-rule bg-paper-2 p-4">
      {/* الهيدر */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link href={`/u/${post.author_code ?? post.author_id}`} className="shrink-0">
            {post.author_avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.author_avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-marker/10 font-bold text-marker">
                {(post.author_name || "؟").trim().charAt(0)}
              </div>
            )}
          </Link>
          <div className="min-w-0">
            <Link href={`/u/${post.author_code ?? post.author_id}`} className="block truncate text-sm font-bold text-ink hover:text-marker">
              {post.author_name || "طالب"}
            </Link>
            <p className="text-xs text-ink-soft">
              {timeAgo(post.created_at)} · {VISIBILITY_LABEL[post.visibility] ?? post.visibility}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {post.kind !== "text" && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${KIND_BADGE[post.kind] ?? KIND_BADGE.text}`}>
              {POST_KIND_AR[post.kind] ?? post.kind}
            </span>
          )}
          {isMine && (
            <button
              onClick={() => void deletePost()}
              aria-label="حذف المنشور"
              className="text-ink-soft transition hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* المحتوى */}
      {post.kind !== "repost" && (
        <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
          {renderBody(post.body)}
        </div>
      )}
      {post.kind === "repost" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-soft">
          <Repeat2 className="h-3.5 w-3.5" /> أعاد نشر منشور
        </p>
      )}
      {post.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image_url} alt="" className="mt-3 max-h-96 w-full rounded-xl object-cover" />
      )}

      {/* الأصل المقتبس/المعاد نشره — بيتجلب بخصوصية مفروضة سيرفر سايد */}
      {embeddedId && (
        <div className="mt-3 rounded-xl border border-rule bg-paper p-3">
          {embedded ? (
            <>
              <Link href={`/u/${embedded.author_code ?? embedded.author_id}`} className="text-xs font-bold text-ink hover:text-marker">
                {embedded.author_name || "طالب"}
              </Link>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{renderBody(embedded.body)}</p>
              {embedded.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={embedded.image_url} alt="" className="mt-2 max-h-64 w-full rounded-lg object-cover" />
              )}
            </>
          ) : embeddedFailed ? (
            <p className="text-xs text-ink-soft">المنشور الأصلي مش متاح (حُذف أو خصوصيته مش مسموحة ليك).</p>
          ) : (
            <p className="flex items-center gap-2 text-xs text-ink-soft">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ تحميل المنشور الأصلي...
            </p>
          )}
        </div>
      )}

      {/* الاستطلاع */}
      {post.kind === "poll" && (
        <div className="mt-3 space-y-2">
          {poll === null ? (
            <p className="flex items-center gap-2 text-xs text-ink-soft">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ تحميل الاستطلاع...
            </p>
          ) : (
            (() => {
              const total = poll.reduce((s, o) => s + Number(o.vote_count), 0);
              const hasVoted = poll.some((o) => o.voted_by_me);
              return poll.map((o) => {
                const pct = total > 0 ? Math.round((Number(o.vote_count) / total) * 100) : 0;
                return (
                  <button
                    key={o.option_id}
                    onClick={() => void vote(o.option_id)}
                    disabled={hasVoted}
                    className={`relative block w-full overflow-hidden rounded-xl border px-3 py-2 text-right text-sm transition ${
                      o.voted_by_me ? "border-marker" : "border-rule hover:border-marker/50"
                    } ${hasVoted ? "cursor-default" : ""}`}
                  >
                    {hasVoted && (
                      <span
                        className="absolute inset-y-0 right-0 bg-marker/10"
                        style={{ width: `${pct}%` }}
                        aria-hidden
                      />
                    )}
                    <span className="relative flex items-center justify-between gap-2">
                      <span className="text-ink">{o.option_text}</span>
                      {hasVoted && (
                        <span className="shrink-0 text-xs font-semibold text-marker">{pct}%</span>
                      )}
                    </span>
                  </button>
                );
              });
            })()
          )}
          {poll && <p className="text-xs text-ink-soft">{poll.reduce((s, o) => s + Number(o.vote_count), 0)} صوت</p>}
        </div>
      )}

      {/* الإجراءات */}
      <div className="mt-3 flex items-center gap-4 border-t border-rule pt-3">
        <button
          onClick={() => void toggleLike()}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 text-sm font-medium transition disabled:opacity-50 ${
            liked ? "text-red-600" : "text-ink-soft hover:text-red-600"
          }`}
          aria-pressed={liked}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-red-600" : ""}`} />
          {likeCount > 0 ? likeCount : "إعجاب"}
        </button>
        <button
          onClick={openComments}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-marker"
          aria-expanded={showComments}
        >
          <MessageCircle className="h-4 w-4" />
          {commentCount > 0 ? commentCount : "تعليق"}
        </button>
        <button
          onClick={() => void doRepost()}
          disabled={busy || reposted}
          className={`inline-flex items-center gap-1.5 text-sm font-medium transition disabled:opacity-50 ${
            reposted ? "text-emerald-600" : "text-ink-soft hover:text-emerald-600"
          }`}
        >
          <Repeat2 className="h-4 w-4" />
          {reposted ? "أُعيد النشر" : "إعادة نشر"}
        </button>
        <button
          onClick={() => setShowQuote((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-marker"
          aria-expanded={showQuote}
        >
          <Quote className="h-4 w-4" />
          اقتباس
        </button>
        <button
          onClick={() => void toggleSave()}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 text-sm font-medium transition disabled:opacity-50 ${
            saved ? "text-marker" : "text-ink-soft hover:text-marker"
          }`}
          aria-pressed={saved}
        >
          <Bookmark className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
          {saved ? "محفوظ" : "حفظ"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {/* صندوق الاقتباس */}
      {showQuote && (
        <div className="mt-3 flex gap-2 border-t border-rule pt-3">
          <textarea
            value={quoteDraft}
            onChange={(e) => setQuoteDraft(e.target.value)}
            placeholder="اقتبس المنشور واكتب رأيك..."
            className="min-h-16 w-full rounded-xl border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-marker"
            maxLength={2000}
            aria-label="اقتباسك"
          />
          <button onClick={() => void submitQuote()} disabled={quoting || !quoteDraft.trim()} className={smallBtn}>
            {quoting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      )}

      {/* التعليقات */}
      {showComments && (
        <div className="mt-3 space-y-3 border-t border-rule pt-3">
          {comments === null ? (
            <p className="flex items-center gap-2 text-xs text-ink-soft">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ تحميل التعليقات...
            </p>
          ) : topLevel.length === 0 ? (
            <p className="text-xs text-ink-soft">كن أول واحد يعلّق.</p>
          ) : (
            topLevel.map((c) => (
              <div key={c.comment_id} className="space-y-2">
                <CommentRow
                  comment={c}
                  currentUserId={currentUserId}
                  onReply={() => setReplyTo(c)}
                  onDelete={() => void deleteComment(c.comment_id)}
                />
                {repliesOf(c.comment_id).map((r) => (
                  <div key={r.comment_id} className="mr-6">
                    <CommentRow
                      comment={r}
                      currentUserId={currentUserId}
                      onReply={() => setReplyTo(r)}
                      onDelete={() => void deleteComment(r.comment_id)}
                    />
                  </div>
                ))}
              </div>
            ))
          )}

          {replyTo && (
            <p className="text-xs text-ink-soft">
              بترّد على {replyTo.author_name || "طالب"} —{" "}
              <button onClick={() => setReplyTo(null)} className="text-marker hover:underline">
                إلغاء
              </button>
            </p>
          )}
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submitComment();
                }
              }}
              placeholder="اكتب تعليقًا..."
              className="w-full rounded-xl border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-marker"
              aria-label="تعليقك"
              maxLength={1000}
            />
            <button onClick={() => void submitComment()} disabled={sending || !draft.trim()} className={smallBtn}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function CommentRow({
  comment,
  currentUserId,
  onReply,
  onDelete,
}: {
  comment: CommunityCommentRow;
  currentUserId: string | null;
  onReply: () => void;
  onDelete: () => void;
}) {
  const canDelete = comment.can_delete || (currentUserId !== null && comment.author_id === currentUserId);
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1 rounded-xl bg-paper px-3 py-2">
        <Link href={`/u/${comment.author_code ?? comment.author_id}`} className="text-xs font-bold text-ink hover:text-marker">
          {comment.author_name || "طالب"}
        </Link>
        <p className="mt-0.5 break-words text-sm text-ink">{renderBody(comment.body)}</p>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-soft">
          <span>{timeAgo(comment.created_at)}</span>
          <button onClick={onReply} className="hover:text-marker">
            رد
          </button>
          {canDelete && (
            <button onClick={onDelete} className="hover:text-red-600">
              حذف
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const smallBtn =
  "inline-flex items-center justify-center rounded-lg bg-marker px-3 py-2 text-white transition hover:opacity-90 disabled:opacity-50";
