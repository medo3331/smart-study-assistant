import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const sql = read("db/100-community-social-c1.sql");
const friendsRoute = read("app/api/community/friends/route.ts");
const followRoute = read("app/api/community/follow/route.ts");
const blockRoute = read("app/api/community/block/route.ts");
const suggestionsRoute = read("app/api/community/suggestions/route.ts");
const profileRoute = read("app/api/community/profile/route.ts");
const relationRoute = read("app/api/community/relation/route.ts");
const handlers = read("lib/community/handlers.ts");

// ---------------------------------------------------------------------------
// عقد قاعدة البيانات — RLS و RPCs
// ---------------------------------------------------------------------------

describe("Community C1 SQL schema contract", () => {
  it("enables RLS on every social table", () => {
    for (const table of ["social_profiles", "friend_requests", "friendships", "follows"]) {
      const enable = new RegExp(`alter table (only )?public\\.${table}\\s+enable row level security`, "i");
      expect(sql.match(enable), `RLS not enabled on ${table}`).toBeTruthy();
    }
  });

  it("blocks direct writes to relation tables (no insert/update/delete policies)", () => {
    // الصداقة والمتابعة بيتكتبوا عبر RPCs security definer بس
    for (const table of ["friendships", "follows"]) {
      const section = sql.slice(sql.indexOf(`public.${table}`), sql.indexOf(`public.${table}`) + 4000);
      expect(section).not.toMatch(/create policy .*for insert/i);
      expect(section).not.toMatch(/create policy .*for update/i);
    }
    // friend_requests: مفيش policy insert مباشر — الإرسال عبر send_friend_request
    const frSection = sql.slice(sql.indexOf("public.friend_requests"), sql.indexOf("create or replace function public.send_friend_request"));
    expect(frSection).not.toMatch(/create policy .*for insert/i);
  });

  it("defines all relation RPCs as security definer granted to authenticated only", () => {
    for (const fn of [
      "social_users_blocked",
      "social_are_friends",
      "send_friend_request",
      "respond_friend_request",
      "cancel_friend_request",
      "remove_friend",
      "follow_user",
      "unfollow_user",
      "get_relation_state",
      "list_community_friends",
      "list_pending_friend_requests",
      "suggest_community_friends",
      "cleanup_relation_on_block",
      "get_social_profile_by_code",
    ]) {
      expect(sql.includes(`function public.${fn}(`), `missing RPC ${fn}`).toBeTruthy();
    }
    // كل RPC مقفول على public ومفتوح بس لـ authenticated
    expect(sql.match(/revoke all on function/g)?.length).toBeGreaterThanOrEqual(13);
    expect(sql.match(/grant execute on function.*to authenticated/g)?.length).toBeGreaterThanOrEqual(13);
  });

  it("friend request RPC enforces blocks, preferences and pending cap", () => {
    const fn = sql.slice(sql.indexOf("function public.send_friend_request"), sql.indexOf("function public.respond_friend_request"));
    expect(fn).toContain("social_users_blocked");
    expect(fn).toContain("allow_friend_requests");
    expect(fn).toContain("30"); // سقف الطلبات المعلّقة
  });

  it("accepting a request creates both symmetric friendship rows", () => {
    const fn = sql.slice(sql.indexOf("function public.respond_friend_request"), sql.indexOf("function public.cancel_friend_request"));
    expect(fn).toContain("insert into public.friendships (user_id, friend_id) values (v_me, v_req.requester_id), (v_req.requester_id, v_me)");
  });

  it("follow_user rejects private accounts", () => {
    const fn = sql.slice(sql.indexOf("function public.follow_user"), sql.indexOf("function public.unfollow_user"));
    expect(fn).toContain("private_account");
  });

  it("search RPC excludes blocked users and abbreviates private accounts", () => {
    const start = sql.indexOf("function public.public_search_public_profiles");
    const fn = sql.slice(start, sql.indexOf("$$;", start));
    expect(fn).toContain("user_blocks"); // الحظر بأي اتجاه → مختفي تمامًا من البحث
    expect(fn).toContain("is_visible");
  });

  it("profile lookup RPC filters blocked and private viewers", () => {
    const fn = sql.slice(sql.indexOf("function public.get_social_profile_by_code"), sql.indexOf("$$;", sql.indexOf("function public.get_social_profile_by_code")));
    expect(fn).toContain("social_users_blocked");
    expect(fn).toContain("account_privacy");
  });
});

// ---------------------------------------------------------------------------
// عقد الـ API routes
// ---------------------------------------------------------------------------

describe("Community C1 API contract", () => {
  it("all routes authenticate before any data access", () => {
    // friends route فيه المنطق مباشرة — الباقي بيلفوا handlers بتتحقق من المصادقة
    expect(friendsRoute).toContain("auth.getUser()");
    expect(friendsRoute).toContain("Authentication required.");
    expect(handlers).toContain("auth.getUser()");
    expect(handlers.match(/Authentication required\./g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("block API cleans up relations before inserting the block row", () => {
    expect(handlers.indexOf("cleanup_relation_on_block")).toBeLessThan(handlers.indexOf('from("user_blocks")'));
    expect(handlers).toContain("Cannot block yourself.");
  });

  it("profile PATCH whitelists fields and validates input", () => {
    expect(handlers).toContain("ALLOWED_PROFILE_FIELDS");
    expect(handlers).toContain("account_privacy");
    expect(handlers).toContain("length < 2 || name.length > 60");
    expect(handlers).toContain("length > 500");
  });

  it("friend actions map to RPCs — no direct table writes in the route", () => {
    expect(friendsRoute).toContain('rpc("send_friend_request"');
    expect(friendsRoute).toContain('rpc("respond_friend_request"');
    expect(friendsRoute).toContain('rpc("cancel_friend_request"');
    expect(friendsRoute).toContain('rpc("remove_friend"');
    expect(friendsRoute).not.toContain('from("friend_requests")');
    expect(friendsRoute).not.toContain('from("friendships")');
  });

  it("returns unified Arabic-mapped relation error codes", () => {
    const types = read("lib/community/types.ts");
    for (const code of ["requests_disabled", "already_friends", "request_exists", "too_many_pending", "private_account", "already_handled"]) {
      expect(types).toContain(code);
    }
  });
});

// ---------------------------------------------------------------------------
// عقد الواجهة و redirects الدعم
// ---------------------------------------------------------------------------

describe("Community C1 UI contract", () => {
  it("community hub is a client page wired to the C1 APIs", () => {
    const page = read("app/community/page.tsx");
    expect(page.startsWith('"use client"')).toBe(true);
    expect(page).toContain("/api/community/friends");
    expect(page).toContain("/api/community/suggestions");
    expect(page).toContain("/api/community/profile");
    expect(page).toContain("/api/users/search");
  });

  it("profile page uses the privacy-filtered lookup RPC and ProfileActions", () => {
    const page = read("app/u/[code]/page.tsx");
    expect(page).toContain("get_social_profile_by_code");
    expect(page).toContain("ProfileActions");
  });

  it("old support entry points redirect into the unified inbox", () => {
    expect(read("app/support/page.tsx")).toContain('redirect("/inbox?category=support")');
    expect(read("app/dashboard/support/page.tsx")).toContain('"/inbox?category=support"');
    expect(read("app/community/communication-center/page.tsx")).toContain('redirect("/inbox")');
  });

  it("inbox opens the support tab from ?category=support", () => {
    const inbox = read("app/inbox/page.tsx");
    expect(inbox).toContain('window.location.search');
    expect(inbox).toContain('params.get("category")');
  });
});
