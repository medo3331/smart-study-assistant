import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// ---------------------------------------------------------------------------
// عقد Community C8 — فرض العقوبات على كل التفاعلات + فريق الإشراف + رد الدعم
// ---------------------------------------------------------------------------

const enforcementSql = read("db/109-enforcement-c8.sql");
const roles = read("lib/auth-roles.ts");
const modRoute = read("app/api/admin/community/moderation/route.ts");
const modClient = read("app/admin/community/moderation/ModerationClient.tsx");
const nav = read("lib/admin/nav.ts");
const autoReply = read("lib/support/auto-reply.ts");
const ticketsRoute = read("app/api/support/tickets/route.ts");
const ticketMsgRoute = read("app/api/support/tickets/[id]/messages/route.ts");
const conversationsRoute = read("app/api/conversations/route.ts");
const inbox = read("app/inbox/page.tsx");
const userPage = read("app/u/[code]/page.tsx");

describe("C8 enforcement SQL contract", () => {
  it("like/save/vote/repost RPCs check the penalty state", () => {
    // كل دالة من الأربع فيها فحص العقوبة بعد فحص الدخول
    const count = (enforcementSql.match(/community_penalty_state\(v_me\)/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(4);
    expect(enforcementSql).toContain("create or replace function public.toggle_post_like");
    expect(enforcementSql).toContain("create or replace function public.toggle_saved_post");
    expect(enforcementSql).toContain("create or replace function public.vote_community_poll");
    expect(enforcementSql).toContain("create or replace function public.repost_community_post");
  });

  it("messaging is blocked for restricted/banned senders (RPC + RLS policy)", () => {
    expect(enforcementSql).toContain("restriction_until");
    expect(enforcementSql).toContain("community_penalty_state(auth.uid()) is null");
    expect(enforcementSql).toMatch(/create policy "messages: insert from authorized sender"/);
  });

  it("backfills missing MAG codes", () => {
    expect(enforcementSql).toContain("public_user_code is null");
  });
});

describe("Moderator role contract", () => {
  it("moderator role exists with community.moderate only", () => {
    expect(roles).toContain('"owner" | "admin" | "support" | "moderator" | null');
    expect(roles).toContain('["owner","admin","support","moderator"]');
    expect(roles).toContain('return ["community.moderate"]');
  });

  it("admin API supports add/remove moderator (owner/admin only)", () => {
    expect(modRoute).toContain('case "add_moderator"');
    expect(modRoute).toContain('case "remove_moderator"');
    expect(modRoute).toContain('g.role !== "owner" && g.role !== "admin"');
    expect(modRoute).toContain('role: "moderator", permissions: ["community.moderate"]');
  });

  it("moderation UI has a team tab and nav exposes the page", () => {
    expect(modClient).toContain("فريق إشراف المجتمع");
    expect(modClient).toContain("add_moderator");
    expect(nav).toContain('"/admin/community/moderation"');
    expect(nav).toContain('"community.moderate"');
  });
});

describe("Support auto-reply contract", () => {
  it("auto-reply is fail-safe, marked, and avoids double auto replies", () => {
    expect(autoReply).toContain("AUTO_MARKER");
    expect(autoReply).toContain("lastAdminReplyIsAuto");
    expect(autoReply).toContain("FALLBACK_REPLY");
    expect(autoReply).toContain("completeChatWithProviderFallback");
  });

  it("fires on ticket creation and on student replies", () => {
    expect(ticketsRoute).toContain("insertSupportAutoReply");
    expect(ticketMsgRoute).toContain("insertSupportAutoReply");
  });
});

describe("Inbox conversations contract", () => {
  it("conversation list shows the other participant's name, avatar and last message", () => {
    expect(conversationsRoute).toContain("social_profiles");
    expect(conversationsRoute).toContain("last_message_body");
    const client = read("components/messaging/InboxClient.tsx");
    expect(client).toContain("other_avatar");
    expect(client).toContain("last_message_body");
  });

  it("inbox search uses the query param the API expects", () => {
    const client = read("components/messaging/InboxClient.tsx");
    expect(client).toContain("?query=${encodeURIComponent(");
    expect(client).not.toContain("?q=${encodeURIComponent(");
  });
});

describe("Profile link contract", () => {
  it("/u/[code] resolves UUID links to the canonical MAG code", () => {
    expect(userPage).toContain("public_user_code");
    expect(userPage).toMatch(/UUID/i);
  });
});

describe("C9 — community moderation page + AI contract", () => {
  const c9Page = read("app/community/moderation/page.tsx");
  const canModerateRoute = read("app/api/community/can-moderate/route.ts");
  const communityPage = read("app/community/page.tsx");

  it("moderation dashboard is reachable inside /community with a server-side guard", () => {
    expect(c9Page).toContain("actorHasPermission");
    expect(c9Page).toContain('redirect("/community?error=الصفحة_للمشرفين_فقط")');
    expect(c9Page).toContain("AdminModerationClient");
  });

  it("community page shows the moderation link only to moderators", () => {
    expect(canModerateRoute).toContain('actorHasPermission(actor, "community.moderate")');
    expect(communityPage).toContain('fetch("/api/community/can-moderate")');
    expect(communityPage).toContain("/community/moderation");
  });

  it("banned profiles list includes manual bans and a direct lift action", () => {
    expect(modRoute).toContain("bannedProfiles");
    expect(modRoute).toContain("is_banned.eq.true,restriction_until.gt.now()");
    expect(modRoute).toContain('case "lift_direct_ban"');
    expect(modClient).toContain("سجلات الحظر والتقييد");
  });

  it("ai_review suggests a decision without executing it", () => {
    expect(modRoute).toContain('case "ai_review"');
    expect(modRoute).toContain("recommended_action");
    expect(modClient).toContain("runAiReview");
    expect(modClient).toContain("اقتراح Magic");
  });

  it("support auto-reply notifies the student", () => {
    expect(autoReply).toContain('"support_reply"');
    expect(autoReply).toContain("/inbox?category=support");
  });
});

// ---------------------------------------------------------------------------
// C10 — إصلاح عرض طوابير الإشراف + إشعار المشرفين بالبلاغات + بحث أقوى للمشرفين
// ---------------------------------------------------------------------------

describe("C10 — moderation queues fix + report notification contract", () => {
  const listFixSql = read("db/110-moderation-list-fix.sql");
  const modHandlers = read("lib/community/moderation-handlers.ts");

  it("migration fixes every social_profiles join to use user_id", () => {
    expect(listFixSql).toContain("create or replace function public.mod_list_reports");
    expect(listFixSql).toContain("create or replace function public.mod_list_actions");
    expect(listFixSql).toContain("create or replace function public.mod_list_appeals");
    expect(listFixSql).toContain("create or replace function public.mod_list_audit");
    // مفيش أي join على عمود id غير الموجود في social_profiles
    expect(listFixSql).not.toMatch(/social_profiles\s+sp\d?\s+on\s+sp\d?\.id\s*=/);
    expect((listFixSql.match(/sp\d?\.user_id =/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("filing a report notifies the moderation team with details", () => {
    expect(modHandlers).toContain('from("site_admins").select("user_id")');
    expect(modHandlers).toContain("🚩 بلاغ جديد في المجتمع");
    expect(modHandlers).toContain('"/community/moderation"');
  });

  it("add_moderator lookup falls back to display name and auth users", () => {
    expect(modRoute).toContain(".ilike(\"display_name\", identifier)");
    expect(modRoute).toContain("auth.admin.listUsers");
    expect(modRoute).toContain("/community/moderation");
  });
});
