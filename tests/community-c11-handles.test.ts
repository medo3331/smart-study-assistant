import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// ---------------------------------------------------------------------------
// عقد Community C11 — اسم المستخدم الخاص بالمجتمع (handle) + ربط الرسايل
// ---------------------------------------------------------------------------

const handlesSql = read("db/111-community-handles.sql");
const handlers = read("lib/community/handlers.ts");
const usersSearch = read("app/api/users/search/route.ts");
const communityPage = read("app/community/page.tsx");
const profilePage = read("app/u/[code]/page.tsx");
const inbox = read("app/inbox/page.tsx");

describe("C11 handles SQL contract", () => {
  it("handle column exists with unique + format constraints", () => {
    expect(handlesSql).toContain("add column if not exists handle text");
    expect(handlesSql).toContain("social_profiles_handle_key unique (handle)");
    expect(handlesSql).toContain("handle ~ '^[a-z0-9_]{3,20}$'");
  });

  it("backfills every existing profile and auto-generates for new rows", () => {
    expect(handlesSql).toContain("where sp.handle is null");
    expect(handlesSql).toContain("social_profiles_default_handle");
    expect(handlesSql).toContain("create trigger trg_social_profiles_default_handle");
  });

  it("change_handle validates format, blocks reserved names, enforces uniqueness", () => {
    expect(handlesSql).toContain("create or replace function public.change_handle");
    expect(handlesSql).toContain("invalid_handle");
    expect(handlesSql).toContain("reserved_handle");
    expect(handlesSql).toContain("handle_taken");
    expect(handlesSql).toContain("'support','admin','magic','magicly','moderation'");
  });

  it("public search matches handle (with or without @) and returns it", () => {
    expect(handlesSql).toContain("v_h := nullif(ltrim(v_q, '@'), '')");
    expect(handlesSql).toContain("sp.handle ilike '%' || v_h || '%'");
    expect(handlesSql).toContain("handle text,");
  });

  it("profile-by-code page function returns the handle", () => {
    expect(handlesSql).toContain("'handle', v_row.handle");
  });
});

describe("C11 app contract", () => {
  it("profile PATCH routes handle changes through change_handle RPC", () => {
    expect(handlers).toContain('rpc("change_handle", { p_handle: handle })');
    expect(handlers).toContain("الاسم ده مأخوذ — اختار اسم تاني.");
    expect(handlers).toContain("الاسم ده محجوز للمنصة — اختار اسم تاني.");
  });

  it("users/search API exposes handle", () => {
    expect(usersSearch).toContain("handle: p.handle ?? null");
  });

  it("community settings form edits the handle", () => {
    expect(communityPage).toContain("handleDraft");
    expect(communityPage).toContain("اسم المستخدم في المجتمع");
  });

  it("profile page displays @handle", () => {
    expect(profilePage).toContain("@{profile.handle}");
  });

  it("inbox fixes: current user is loaded, header shows the other participant, search shows handle", () => {
    const client = read("components/messaging/InboxClient.tsx");
    // حالة المستخدم الحالي بتتحمّل — عشان اتجاه الرسايل يبقى صح
    expect(client).toContain("setMe(data.user?.id ?? null)");
    expect(client).toContain("selectedConvMeta?.title");
    expect(client).toContain("`@${u.handle}`");
    // MAG ID مش سر — input عادي مش password
    expect(client).not.toContain('type="password"');
  });
});
