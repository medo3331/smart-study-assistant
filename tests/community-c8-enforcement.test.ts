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
    expect(inbox).toContain("other_avatar");
    expect(inbox).toContain("last_message_body");
  });

  it("inbox search uses the query param the API expects", () => {
    expect(inbox).toContain("data.profiles || data.users");
    expect(inbox).toContain("?query=${encodeURIComponent(query)}");
    expect(inbox).not.toContain("?q=${encodeURIComponent(query)}");
  });
});

describe("Profile link contract", () => {
  it("/u/[code] resolves UUID links to the canonical MAG code", () => {
    expect(userPage).toContain("public_user_code");
    expect(userPage).toMatch(/UUID/i);
  });
});
