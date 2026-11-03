import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const listRoute = read("app/api/announcements/route.ts");
const itemRoute = read("app/api/announcements/[id]/route.ts");
const readRoute = read("app/api/announcements/[id]/read/route.ts");
const unreadRoute = read("app/api/announcements/unread-count/route.ts");

describe("Phase 1B.1 announcement API security review", () => {
  it("all announcement routes require authentication", () => {
    expect(listRoute).toContain('supabase.auth.getUser()');
    expect(listRoute).toContain('Authentication required.');
    expect(itemRoute).toContain('Authentication required.');
    expect(readRoute).toContain('Authentication required.');
    expect(unreadRoute).toContain('Authentication required.');
  });

  it("admin mutations check announcements.manage before writes", () => {
    expect(listRoute).toContain('hasPermission(service,user.id,user.email??null,"announcements.manage")');
    expect(itemRoute).toContain('hasPermission(service,user.id,user.email??null,"announcements.manage")');
    expect(itemRoute.match(/adminAllowed/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("mutations use service client and record audit logs", () => {
    expect(listRoute).toContain('createServiceClient()');
    expect(itemRoute).toContain('createServiceClient()');
    expect(listRoute).toContain('recordAuditLog');
    expect(itemRoute).toContain('recordAuditLog');
    expect(listRoute).toContain('operation: "create"');
    expect(itemRoute).toContain('operation: "update"');
    expect(itemRoute).toContain('operation: "delete"');
  });

  it("validates UUIDs and malformed JSON", () => {
    expect(itemRoute).toContain('isUuid(id)');
    expect(readRoute).toContain('isUuid(id)');
    expect(listRoute).toContain('await req.json().catch(()=>null)');
    expect(itemRoute).toContain('await req.json().catch(()=>null)');
  });

  it("partial PATCH validates combined publication windows", () => {
    expect(itemRoute).toContain('select("status,publish_at,expires_at")');
    expect(itemRoute).toContain('nextPublish=publishAt===undefined');
    expect(itemRoute).toContain('nextExpires=expiresAt===undefined');
    expect(itemRoute).toContain('nextPublish&&nextExpires&&nextPublish>=nextExpires');
    expect(itemRoute).toContain('nextStatus==="published"&&nextExpires&&nextExpires<=now');
  });

  it("read receipts require active published announcements", () => {
    expect(readRoute).toContain('.eq("status","published")');
    expect(readRoute).toContain('publish_at.is.null,publish_at.lte.');
    expect(readRoute).toContain('expires_at.is.null,expires_at.gt.');
    expect(readRoute).toContain('error.code==="23505"');
  });

  it("unread count is scoped to the authenticated user", () => {
    expect(unreadRoute).toContain('.eq("user_id",user.id)');
    expect(unreadRoute).toContain('.eq("status","published")');
  });

  it("database failures return controlled errors", () => {
    expect(listRoute).toContain('Failed to load announcements.');
    expect(itemRoute).toContain('Failed to update announcement.');
    expect(readRoute).toContain('Failed to verify announcement.');
    expect(unreadRoute).toContain('Failed to load read receipts.');
  });
});
