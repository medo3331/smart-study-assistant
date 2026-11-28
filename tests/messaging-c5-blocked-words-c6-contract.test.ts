import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// ---------------------------------------------------------------------------
// عقد المراسلة C5 + الفلترة C6 — فحص ثابت للملفات (نفس أسلوب C3/C4)
// ---------------------------------------------------------------------------

const requestsRoute = read("app/api/messages/requests/route.ts");
const acceptRoute = read("app/api/messages/requests/[id]/accept/route.ts");
const messageRoute = read("app/api/conversations/[id]/message/route.ts");
const friendsRoute = read("app/api/community/friends/route.ts");
const handlers = read("lib/community/handlers.ts");
const blockedSql = read("db/108-blocked-words.sql");
const postsRoute = read("app/api/community/posts/route.ts");
const commentsRoute = read("app/api/community/posts/[id]/comments/route.ts");
const adminModRoute = read("app/api/admin/community/moderation/route.ts");
const modClient = read("app/admin/community/moderation/ModerationClient.tsx");
const adminUserPage = read("app/admin/users/[id]/page.tsx");
const modPanel = read("app/admin/users/[id]/ModerationPanel.tsx");

describe("Messaging C5 contract", () => {
  it("requests POST uses the send_message_request RPC (single atomic path)", () => {
    expect(requestsRoute).toContain('rpc("send_message_request"');
    // لم يعد يقرأ auth.users أو public_profiles مباشرة
    expect(requestsRoute).not.toContain('from("auth.users")');
  });

  it("sends a notification to the receiver when a pending request is created", () => {
    expect(requestsRoute).toContain("socialNotify");
    expect(requestsRoute).toContain("/inbox?category=requests");
  });

  it("accept route handles the jsonb RPC result and notifies the sender", () => {
    expect(acceptRoute).toContain("result.ok");
    expect(acceptRoute).toContain("result.conversation_id");
    expect(acceptRoute).toContain("socialNotify");
    expect(acceptRoute).not.toContain("data[0].conversation_id");
  });

  it("message send notifies other participants", () => {
    expect(messageRoute).toContain("socialNotify");
    expect(messageRoute).toContain("رسالة جديدة");
  });

  it("friend request / accept send notifications", () => {
    expect(friendsRoute).toContain("وصلك طلب صداقة");
    expect(friendsRoute).toContain("تم قبول طلب الصداقة");
  });

  it("follow sends a notification", () => {
    expect(handlers).toContain("متابع جديد");
  });

  it("socialNotify writes via the service client (notifications RLS has no INSERT policy)", () => {
    expect(handlers).toContain('import("@/lib/supabase/admin")');
    expect(handlers).toContain("createServiceClient");
  });
});

describe("Blocked words C6 contract", () => {
  it("SQL: table is RLS-locked with read-only policy + deterministic check RPC", () => {
    expect(blockedSql).toContain("create table if not exists public.moderation_blocked_words");
    expect(blockedSql).toContain("alter table public.moderation_blocked_words enable row level security");
    expect(blockedSql).toContain("community_text_has_blocked_word");
    // لا سياسة كتابة للمستخدم العادي — الكتابة عبر service client من طبقة الأدمن
    expect(blockedSql).not.toMatch(/for insert/);
  });

  it("posts route checks blocked words before the AI scan", () => {
    const bwPos = postsRoute.indexOf("community_text_has_blocked_word");
    const scanPos = postsRoute.indexOf("await scanCommunityText");
    expect(bwPos).toBeGreaterThan(-1);
    expect(scanPos).toBeGreaterThan(bwPos);
    expect(postsRoute).toContain("content_blocked");
  });

  it("comments route checks blocked words before the AI scan", () => {
    const bwPos = commentsRoute.indexOf("community_text_has_blocked_word");
    const scanPos = commentsRoute.indexOf("await scanCommunityText");
    expect(bwPos).toBeGreaterThan(-1);
    expect(scanPos).toBeGreaterThan(bwPos);
  });

  it("admin API supports add/remove blocked words via service client", () => {
    expect(adminModRoute).toContain('case "add_blocked_word"');
    expect(adminModRoute).toContain('case "remove_blocked_word"');
    expect(adminModRoute).toContain("moderation_blocked_words");
  });

  it("admin moderation UI has a blocked-words tab", () => {
    expect(modClient).toContain("الكلمات الممنوعة");
    expect(modClient).toContain("add_blocked_word");
    expect(modClient).toContain("remove_blocked_word");
  });
});

describe("Admin user moderation panel contract", () => {
  it("user details page shows ban status and moderation actions", () => {
    expect(adminUserPage).toContain("is_banned, banned_at, ban_reason, restriction_until, warning_count");
    expect(adminUserPage).toContain("UserModerationPanel");
    expect(adminUserPage).toContain("moderation_actions");
  });

  it("panel issues warning/restrict/suspend and lifts actions via C4 API", () => {
    expect(modPanel).toContain('actionType: "warning"');
    expect(modPanel).toContain('actionType: "restrict"');
    expect(modPanel).toContain('actionType: "suspend"');
    expect(modPanel).toContain("lift_action");
  });
});
