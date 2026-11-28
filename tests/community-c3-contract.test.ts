import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const sql = read("db/105-community-groups-c3.sql");
const groupsRoute = read("app/api/community/groups/route.ts");
const detailsRoute = read("app/api/community/groups/[id]/route.ts");
const membershipRoute = read("app/api/community/groups/[id]/membership/route.ts");
const membersRoute = read("app/api/community/groups/[id]/members/route.ts");
const groupPostsRoute = read("app/api/community/groups/[id]/posts/route.ts");
const groupsPage = read("app/community/groups/page.tsx");
const groupPage = read("app/community/groups/[id]/page.tsx");
const hubPage = read("app/community/page.tsx");

describe("Community C3 SQL contract", () => {
  it("group tables are RLS-locked with no direct access", () => {
    expect(sql).toContain("alter table public.community_groups enable row level security");
    expect(sql).toContain("alter table public.community_group_members enable row level security");
    // كل القراءة عبر RPCs — مفيش policies مباشرة على الجداول
    expect(sql).not.toMatch(/create policy\s+"?community_group/);
  });

  it("kinds and privacy are constrained, member roles limited to owner/moderator/member", () => {
    expect(sql).toContain("check (kind in ('general','university','faculty','major','batch','study'))");
    expect(sql).toContain("check (privacy in ('public','private'))");
    expect(sql).toContain("check (role in ('owner','moderator','member'))");
    expect(sql).toContain("check (status in ('approved','pending'))");
  });

  it("private groups create pending requests and notify moderators", () => {
    const fn = sql.slice(sql.indexOf("function public.join_community_group"), sql.indexOf("$$;", sql.indexOf("function public.join_community_group")));
    expect(fn).toContain("status', 'pending'");
    expect(fn).toContain("notify_user_ids");
  });

  it("only moderators approve members, and owners cannot be removed or leave", () => {
    const approve = sql.slice(sql.indexOf("function public.approve_group_member"), sql.indexOf("$$;", sql.indexOf("function public.approve_group_member")));
    expect(approve).toContain("group_is_moderator(p_group_id, auth.uid())");
    const remove = sql.slice(sql.indexOf("function public.remove_group_member"), sql.indexOf("$$;", sql.indexOf("function public.remove_group_member")));
    expect(remove).toContain("v_target_role = 'owner'");
    const leave = sql.slice(sql.indexOf("function public.leave_community_group"), sql.indexOf("$$;", sql.indexOf("function public.leave_community_group")));
    expect(leave).toContain("owner_cannot_leave");
  });

  it("group posts require approved membership and main feed excludes group posts", () => {
    const create = sql.slice(sql.indexOf("p_group_id      uuid default null"), sql.indexOf("function public.get_community_feed", sql.indexOf("drop function if exists public.get_community_feed")));
    expect(create).toContain("m.status = 'approved'");
    expect(create).toContain("not_allowed");
    // الفيد الرئيسي يستثني منشورات المجموعات
    const feed = sql.slice(sql.lastIndexOf("create or replace function public.get_community_feed"));
    expect(feed).toContain("p.group_id is null");
  });

  it("private group feed is members-only, public group feed is open to logged-in users", () => {
    const feed = sql.slice(sql.indexOf("function public.get_group_feed"), sql.indexOf("$$;", sql.indexOf("function public.get_group_feed")));
    expect(feed).toContain("g.privacy = 'public'");
    expect(feed).toContain("m.status = 'approved'");
  });

  it("group member lists require membership or a public group", () => {
    const fn = sql.slice(sql.indexOf("function public.get_group_members"), sql.indexOf("$$;", sql.indexOf("function public.get_group_members")));
    expect(fn).toContain("g.privacy = 'public'");
    expect(fn).toContain("mm.status = 'approved'");
  });

  it("private non-members get limited group details only", () => {
    const fn = sql.slice(sql.indexOf("function public.get_group_details"), sql.indexOf("$$;", sql.indexOf("function public.get_group_details")));
    expect(fn).toContain("'limited', true");
    expect(fn).toContain("v_group.privacy = 'private' and not v_is_member");
  });
});

describe("Community C3 API contract", () => {
  it("groups route validates kind and clamps inputs", () => {
    expect(groupsRoute).toContain('GROUP_KINDS');
    expect(groupsRoute).toContain("scope=mine");
    expect(groupsRoute).toContain("q.trim().slice(0, 80)");
  });

  it("membership route only allows join/leave/cancel and notifies moderators on private join", () => {
    expect(membershipRoute).toContain('action !== "join" && action !== "leave" && action !== "cancel"');
    expect(membershipRoute).toContain("notify_user_ids");
    expect(membershipRoute).toContain("socialNotify");
  });

  it("members route gates moderation actions and notifies approved users", () => {
    expect(membersRoute).toContain("approve_group_member");
    expect(membersRoute).toContain("remove_group_member");
    expect(membersRoute).toContain("set_group_member_role");
    expect(membersRoute).toContain('role === "moderator" || body?.role === "member"');
    expect(membersRoute).toContain("socialNotify");
  });

  it("group posts route posts with p_group_id and forces visibility server-side", () => {
    expect(groupPostsRoute).toContain("p_group_id: id");
    expect(groupPostsRoute).toContain('p_visibility: "public"');
    expect(groupPostsRoute).toContain("UUID_RE.test(id)");
  });

  it("details route returns 404 for not-found groups without leaking the reason", () => {
    expect(detailsRoute).toContain("get_group_details");
    expect(detailsRoute).toContain('status: 404');
  });
});

describe("Community C3 UI contract", () => {
  it("groups page has discover/search, my groups, and create dialog with privacy choice", () => {
    expect(groupsPage).toContain('scope=mine');
    expect(groupsPage).toContain("طلب انضمام");
    expect(groupsPage).toContain('setPrivacy("private")');
    expect(groupsPage).toContain("KIND_AR");
  });

  it("group page shows join/leave, moderator approve/reject, and members list", () => {
    expect(groupPage).toContain("membershipAction");
    expect(groupPage).toContain('memberAction("approve"');
    expect(groupPage).toContain('memberAction("reject"');
    expect(groupPage).toContain("طلبات الانضمام");
    expect(groupPage).toContain("PostCard");
    expect(groupPage).toContain("/api/community/upload");
  });

  it("community hub links to groups", () => {
    expect(hubPage).toContain('href="/community/groups"');
  });
});
