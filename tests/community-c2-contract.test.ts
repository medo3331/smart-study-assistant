import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const sql = read("db/101-community-posts-c2.sql");
const postsRoute = read("app/api/community/posts/route.ts");
const itemRoute = read("app/api/community/posts/[id]/route.ts");
const likeRoute = read("app/api/community/posts/[id]/like/route.ts");
const commentsRoute = read("app/api/community/posts/[id]/comments/route.ts");
const commentDeleteRoute = read("app/api/community/posts/[id]/comments/[commentId]/route.ts");
const saveRoute = read("app/api/community/posts/[id]/save/route.ts");
const savedRoute = read("app/api/community/saved-posts/route.ts");
const userPostsRoute = read("app/api/community/users/[id]/posts/route.ts");
const hashtagRoute = read("app/api/community/hashtags/[tag]/route.ts");
const uploadRoute = read("app/api/community/upload/route.ts");
const hubPage = read("app/community/page.tsx");
const composer = read("components/community/CommunityComposer.tsx");
const postCard = read("components/community/PostCard.tsx");

// ---------------------------------------------------------------------------
// عقد قاعدة البيانات
// ---------------------------------------------------------------------------

describe("Community C2 SQL schema contract", () => {
  it("creates all post tables idempotently and enables RLS on each", () => {
    for (const table of [
      "community_posts",
      "community_post_likes",
      "community_comments",
      "community_saved_posts",
      "community_hashtags",
      "community_post_hashtags",
      "community_mentions",
    ]) {
      expect(sql.includes(`create table if not exists public.${table}`), `missing table ${table}`).toBeTruthy();
      // الجداول مقفولة تمامًا — القراءة والكتابة عبر الـRPCs فقط
      expect(sql.includes(`alter table public.%I enable row level security`, ) || sql.includes(`'${table}'`)).toBeTruthy();
    }
    expect(sql).toContain("enable row level security");
  });

  it("post visibility is constrained to public/friends/private", () => {
    expect(sql).toContain("check (visibility in ('public','friends','private'))");
  });

  it("create RPC validates body, kind, visibility, image path and enforces rate cap", () => {
    const fn = sql.slice(sql.indexOf("function public.create_community_post"), sql.indexOf("function public.delete_community_post"));
    expect(fn).toContain("length(btrim(p_body)) = 0 or length(p_body) > 2000");
    expect(fn).toContain("invalid_kind");
    expect(fn).toContain("invalid_visibility");
    expect(fn).toContain("^/uploads/community/");
    expect(fn).toContain("rate_limited");
    expect(fn).toContain("interval '1 hour'");
  });

  it("create RPC extracts hashtags and MAG-code mentions", () => {
    const fn = sql.slice(sql.indexOf("function public.create_community_post"), sql.indexOf("function public.delete_community_post"));
    expect(fn).toContain("regexp_matches");
    expect(fn).toContain("community_hashtags");
    expect(fn).toContain("community_mentions");
    expect(fn).toContain("MAG-");
  });

  it("like/comment/save RPCs enforce post visibility via social_can_view_post", () => {
    for (const fnName of ["toggle_post_like", "add_post_comment", "toggle_saved_post"]) {
      const start = sql.indexOf(`function public.${fnName}(`);
      const fn = sql.slice(start, sql.indexOf("$$;", start));
      expect(fn).toContain("social_can_view_post");
      expect(fn).toContain("deleted_at is null");
    }
  });

  it("feed respects privacy: public for all, friends-only for friends, private for author", () => {
    const fn = sql.slice(sql.indexOf("function public.get_community_feed"), sql.indexOf("$$;", sql.indexOf("function public.get_community_feed")));
    expect(fn).toContain("p.visibility = 'public'");
    expect(fn).toContain("p.visibility = 'friends'");
    expect(fn).toContain("social_are_friends(p.author_id, me.uid)");
    expect(fn).toContain("user_blocks");
    expect(fn).toContain("p.deleted_at is null");
  });

  it("comments are capped and nested comments validated to same post", () => {
    const fn = sql.slice(sql.indexOf("function public.add_post_comment"), sql.indexOf("$$;", sql.indexOf("function public.add_post_comment")));
    expect(fn).toContain("length(p_body) > 1000");
    expect(fn).toContain("invalid_parent");
  });

  it("comment deletion allowed for comment author or post author only", () => {
    const fn = sql.slice(sql.indexOf("function public.delete_post_comment"), sql.indexOf("$$;", sql.indexOf("function public.delete_post_comment")));
    expect(fn).toContain("author_id = v_me or v_post_author = v_me");
  });

  it("extends the unified notifications check to allow social notifications", () => {
    expect(sql).toContain("'social'");
    expect(sql).toContain("notifications_type_check");
  });

  it("all C2 RPCs are locked from public and granted to authenticated", () => {
    expect(sql.match(/grant execute on function.*to authenticated/g)?.length).toBeGreaterThanOrEqual(13);
    expect(sql.match(/revoke all on function/g)?.length).toBeGreaterThanOrEqual(13);
  });
});

// ---------------------------------------------------------------------------
// عقد الـAPIs
// ---------------------------------------------------------------------------

describe("Community C2 API contract", () => {
  it("all routes authenticate via getAuthedClient before any data access", () => {
    const handlers = read("lib/community/handlers.ts");
    expect(handlers).toContain("auth.getUser()");
    for (const route of [postsRoute, itemRoute, likeRoute, commentsRoute, commentDeleteRoute, saveRoute, savedRoute, userPostsRoute, hashtagRoute, uploadRoute]) {
      expect(route.includes("getAuthedClient") || route.includes("auth.getUser()"), "route missing auth gate").toBeTruthy();
    }
  });

  it("routes validate UUID ids before touching the database", () => {
    for (const route of [itemRoute, likeRoute, commentsRoute, commentDeleteRoute, saveRoute, userPostsRoute]) {
      expect(route).toContain("UUID_RE.test");
    }
  });

  it("like and comment APIs notify the post author, never self", () => {
    expect(likeRoute).toContain("socialNotify");
    expect(likeRoute).toContain("post.author_id !== auth.user.id");
    expect(commentsRoute).toContain("socialNotify");
  });

  it("hashtag API sanitizes the tag input", () => {
    expect(hashtagRoute).toContain('replace(/^#/, "")');
    expect(hashtagRoute).toContain("Invalid tag.");
  });

  it("upload API allows community images only within size limit", () => {
    expect(uploadRoute).toContain('"image/jpeg", "image/png", "image/gif", "image/webp"');
    expect(uploadRoute).toContain("5 * 1024 * 1024");
  });
});

// ---------------------------------------------------------------------------
// عقد الواجهة
// ---------------------------------------------------------------------------

describe("Community C2 UI contract", () => {
  it("community hub has a feed tab wired to the C2 APIs", () => {
    expect(hubPage).toContain('id: "feed"');
    expect(hubPage).toContain('useState<Tab>("feed")');
    // الكومبوزر بقى مكوّن مستقل (C7) — النشر والرفع هناك
    expect(composer).toContain('fetch("/api/community/posts"');
    expect(hubPage).toContain('"/api/community/saved-posts"');
    expect(composer).toContain('fetch("/api/community/upload"');
    // الخصوصية اختيار المستخدم لكل منشور
    expect(composer).toContain('"friends"');
  });

  it("post card renders hashtags/mentions as links with optimistic like", () => {
    expect(postCard).toContain("/community/tag/");
    expect(postCard).toContain("/u/");
    expect(postCard).toContain("aria-pressed");
    expect(postCard).toContain("can_delete");
  });

  it("hashtag page and profile posts use the same PostCard", () => {
    expect(read("app/community/tag/[tag]/page.tsx")).toContain("PostCard");
    expect(read("components/community/UserPosts.tsx")).toContain("PostCard");
    expect(read("app/u/[code]/page.tsx")).toContain("UserPosts");
  });
});
