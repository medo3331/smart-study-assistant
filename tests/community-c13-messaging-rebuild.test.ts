import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// ---------------------------------------------------------------------------
// عقد C13 — إعادة بناء نظام الرسايل من الصفر بدون أخطاء
// ---------------------------------------------------------------------------

const rlsFix = read("db/112-messaging-rls-fix.sql");
const acceptRoute = read("app/api/messages/requests/[id]/accept/route.ts");
const msgRoute = read("app/api/conversations/[id]/message/route.ts");
const requestsRoute = read("app/api/messages/requests/route.ts");
const client = read("components/messaging/InboxClient.tsx");
const inboxPage = read("app/inbox/page.tsx");

describe("C13 — messaging rebuild contract", () => {
  it("RLS policy fixed: no self-comparison leak in participant reads", () => {
    expect(rlsFix).toContain("create policy \"conversation_participants: read own conversation membership\"");
    // الارتباط الصحيح: صف المشاركين مرتبط بمحادثة السياسة نفسها
    expect(rlsFix).toContain("cp.conversation_id = conversation_participants.conversation_id");
    expect(rlsFix).not.toContain("cp.conversation_id = cp.conversation_id");
  });

  it("accept route calls the RPC without the schema prefix (the 100% failure bug)", () => {
    expect(acceptRoute).toContain('rpc("accept_message_request"');
    expect(acceptRoute).not.toContain('rpc("public.accept_message_request"');
    // القبول الناجح بيرجّع conversation_id
    expect(acceptRoute).toContain("conversation_id");
  });

  it("message send: recipient filter correct + no dead message_state writes", () => {
    // الصيغة القديمة .eq("participant_id", "!=", ...) كانت بتفشل بصمت
    expect(msgRoute).toContain('.neq("participant_id", user.id)');
    expect(msgRoute).not.toContain('.eq("participant_id", "!=", user.id)');
    expect(msgRoute).not.toContain('from("message_state")');
    // الإشعار بيرجّع لصندوق الرسايل
    expect(msgRoute).toContain("`/inbox`");
  });

  it("message requests list is enriched with the sender identity", () => {
    expect(requestsRoute).toContain("sender_name");
    expect(requestsRoute).toContain("sender_handle");
    expect(requestsRoute).toContain("social_profiles");
  });

  it("new InboxClient: 3 tabs, unified search (name/@handle/MAG), polling, RTL-aligned chat", () => {
    expect(client).toContain('"chats" | "requests" | "support"');
    expect(client).toContain("MAG_RE");
    expect(client).toContain("/api/users/mag-lookup");
    expect(client).toContain("/api/users/search");
    // صديق ⇒ محادثة فورية بدون طلب
    expect(client).toContain('status === "conversation"');
    // قبول الطلب بيفتح المحادثة على طول
    expect(client).toContain("data.conversation?.id");
    // تحديث دوري للرسايل والمحادثات
    expect(client).toContain("setInterval");
    // اللايف شات — Realtime على جدول messages (C13.2)
    expect(client).toContain('channel(`messaging:${selectedConv}`)');
    expect(client).toContain('"postgres_changes"');
    expect(client).toContain('table: "messages"');
    // الاتجاه: رسايلي على اليسار (RTL) — مرتبطة بالمستخدم المحمّل
    expect(client).toContain("m.sender_id === me");
  });

  it("/inbox page is a thin wrapper around the new client", () => {
    expect(inboxPage).toContain("InboxClient");
    // الرابط القديم لطلبات المراسلة بيوجّه للصندوق الموحد
    expect(read("app/messages/requests/page.tsx")).toContain('redirect("/inbox")');
  });
});
