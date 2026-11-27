import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const sql = read("db/102-community-c2b.sql");
const leaderboardRoute = read("app/api/community/leaderboard/route.ts");
const trendingRoute = read("app/api/community/trending/route.ts");
const pollRoute = read("app/api/community/posts/[id]/poll/route.ts");
const repostRoute = read("app/api/community/posts/[id]/repost/route.ts");
const postsRoute = read("app/api/community/posts/route.ts");
const hubPage = read("app/community/page.tsx");
const postCard = read("components/community/PostCard.tsx");
const types = read("lib/community/types.ts");

describe("Community C2b SQL contract", () => {
  it("poll options are constrained to 2-4 positions with bounded text", () => {
    expect(sql).toContain("check (length(btrim(option_text)) between 1 and 100)");
    expect(sql).toContain("check (position between 1 and 4)");
    expect(sql).toContain("unique (post_id, position)");
  });

  it("one vote per user per poll, changeable", () => {
    expect(sql).toContain("primary key (post_id, user_id)");
    const fn = sql.slice(sql.indexOf("function public.vote_community_poll"), sql.indexOf("$$;", sql.indexOf("function public.vote_community_poll")));
    expect(fn).toContain("social_can_view_post");
    expect(fn).toContain("kind = 'poll'");
    expect(fn).toContain("delete from public.community_poll_votes where post_id = p_post_id and user_id = v_me");
  });

  it("create RPC validates poll options and quote permissions", () => {
    const fn = sql.slice(sql.indexOf("function public.create_community_post"), sql.indexOf("function public.vote_community_poll"));
    expect(fn).toContain("array_length(p_options, 1) < 2 or array_length(p_options, 1) > 4");
    expect(fn).toContain("invalid_poll");
    // الاقتباس بيفرض خصوصية الأصل
    expect(fn).toContain("social_can_view_post(v_quote.author_id, v_quote.visibility, v_me)");
  });

  it("repost stores a placeholder body — original content fetched via privacy-gated details", () => {
    const fn = sql.slice(sql.indexOf("function public.repost_community_post"), sql.indexOf("$$;", sql.indexOf("function public.repost_community_post")));
    expect(fn).toContain("'🔁 إعادة نشر'");
    expect(fn).toContain("already_reposted");
    // الأصل لازم يكون ظاهر للناشر
    expect(fn).toContain("social_can_view_post(v_orig.author_id, v_orig.visibility, v_me)");
    // منع إعادة نشر إعادة نشر
    expect(fn).toContain("repost_of_post_id is null");
  });

  it("XP leaderboard orders by xp desc, excludes blocked users, includes streak", () => {
    const fn = sql.slice(sql.indexOf("function public.get_xp_leaderboard"), sql.indexOf("$$;", sql.indexOf("function public.get_xp_leaderboard")));
    expect(fn).toContain("order by pr.xp desc");
    expect(fn).toContain("user_blocks");
    expect(fn).toContain("pr.streak");
  });

  it("trending counts public posts only within last 7 days", () => {
    const fn = sql.slice(sql.indexOf("function public.get_trending_hashtags"), sql.indexOf("$$;", sql.indexOf("function public.get_trending_hashtags")));
    expect(fn).toContain("p.visibility = 'public'");
    expect(fn).toContain("interval '7 days'");
  });

  it("extended read functions expose repost/quote ids and stay privacy-gated", () => {
    expect((sql.match(/repost_of_post_id uuid, quote_post_id uuid/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(sql.match(/drop function if exists public\.get_/g)?.length).toBe(5);
  });

  it("all new RPCs granted to authenticated only", () => {
    for (const fn of [
      "vote_community_poll",
      "get_poll_results",
      "repost_community_post",
      "get_xp_leaderboard",
      "get_my_leaderboard_rank",
      "get_trending_hashtags",
    ]) {
      expect(sql.includes(`grant execute on function public.${fn}`), `missing grant ${fn}`).toBeTruthy();
    }
  });
});

describe("Community C2b API contract", () => {
  it("all routes authenticate before data access", () => {
    for (const route of [leaderboardRoute, trendingRoute, pollRoute, repostRoute, postsRoute]) {
      expect(route.includes("getAuthedClient") || route.includes("auth.getUser()")).toBeTruthy();
    }
  });

  it("poll vote validates the option id format", () => {
    expect(pollRoute).toContain("UUID_RE.test(body.optionId)");
  });

  it("posts route forwards poll options and quote id to the RPC", () => {
    expect(postsRoute).toContain("p_options");
    expect(postsRoute).toContain("p_quote_post_id");
  });
});

describe("Community C2b UI contract", () => {
  it("hub shows XP leaderboard with viewer rank and trending chips", () => {
    expect(hubPage).toContain("/api/community/leaderboard");
    expect(hubPage).toContain("/api/community/trending");
    expect(hubPage).toContain("ترتيبك");
    expect(hubPage).toContain("صدارة الطلاب");
  });

  it("composer supports polls with 2-4 option inputs", () => {
    expect(hubPage).toContain('pollOptions');
    expect(hubPage).toContain('postKind === "poll"');
  });

  it("post card renders polls, embedded originals, repost and quote actions", () => {
    expect(postCard).toContain("/poll");
    expect(postCard).toContain("/repost");
    expect(postCard).toContain("quotePostId");
    expect(postCard).toContain("repost_of_post_id");
    expect(types).toContain('poll: "استطلاع رأي"');
    expect(types).toContain("already_reposted");
  });
});
