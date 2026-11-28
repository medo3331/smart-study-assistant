import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// ---------------------------------------------------------------------------
// عقد Community C7 — كومبوزر المنشورات + Magic AI
// ---------------------------------------------------------------------------

const aiAssist = read("app/api/community/ai-assist/route.ts");
const composer = read("components/community/CommunityComposer.tsx");
const page = read("app/community/page.tsx");
const postCard = read("components/community/PostCard.tsx");

describe("Magic AI assist API contract", () => {
  it("has three modes with Arabic system prompts and a timeout", () => {
    expect(aiAssist).toContain('improve: [');
    expect(aiAssist).toContain('expand: [');
    expect(aiAssist).toContain('hashtags: [');
    expect(aiAssist).toContain("ai_assist_timeout");
    expect(aiAssist).toContain("completeChatWithProviderFallback");
  });

  it("is auth-required and rate-limited", () => {
    expect(aiAssist).toContain("getAuthedClient");
    expect(aiAssist).toContain("rateLimit");
    expect(aiAssist).toContain("429");
  });

  it("hashtags mode appends tags instead of replacing the text", () => {
    expect(aiAssist).toContain("startsWith(\"#\")");
    expect(aiAssist).toContain("current.includes(result)");
  });
});

describe("CommunityComposer contract", () => {
  it("composer is a standalone component wired into the community page", () => {
    expect(composer).toContain("export default function CommunityComposer");
    expect(page).toContain("<CommunityComposer");
    expect(page).toContain("displayName={profile?.display_name}");
    // الكومبوزر القديم اتشال من الصفحة
    expect(page).not.toContain("ايه اللي في بالك؟ شارك إنجازك");
  });

  it("publishes through /api/community/posts and refreshes the feed", () => {
    expect(composer).toContain('fetch("/api/community/posts"');
    expect(composer).toContain("onPublished?.()");
  });

  it("exposes Magic AI actions (improve/expand/hashtags) applied to the draft", () => {
    expect(composer).toContain('fetch("/api/community/ai-assist"');
    expect(composer).toContain("حَسّن الصياغة");
    expect(composer).toContain("وسّع فكرتك");
    expect(composer).toContain("اقترح هاشتاجات");
  });

  it("keeps poll options, image upload, visibility and char counter", () => {
    expect(composer).toContain("خيارات الاستطلاع");
    expect(composer).toContain("/api/community/upload");
    expect(composer).toContain('id: "friends"');
    expect(composer).toContain("aria-live=\"polite\"");
  });
});

describe("Comment UX contract", () => {
  it("comment box has quick emoji reactions", () => {
    expect(postCard).toContain("ردود سريعة");
    expect(postCard).toContain("💯");
  });
});
