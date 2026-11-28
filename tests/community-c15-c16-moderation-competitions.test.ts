import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("C15 — موافقة المنشورات + الإنفاذ التلقائي", () => {
  const db = () => read("db/117-community-post-approval.sql");

  it("db/117: عمود status + قيد + فهرس", () => {
    const sql = db();
    expect(sql).toContain("add column if not exists status");
    expect(sql).toContain("set default 'pending'");
    expect(sql).toContain("community_posts_status_check");
  });

  it("db/117: دالة الموافقة محمية (is_site_admin / service_role) وبتبلّغ صاحب المنشور", () => {
    const sql = db();
    expect(sql).toContain("mod_review_post");
    expect(sql).toContain("is_site_admin()");
    expect(sql).toContain("service_role");
    // بتبلّغ صاحب المنشور بإشعار على القرار
    expect(sql).toContain("insert into public.notifications");
  });

  it("db/117: قوائم القراءة بتفلتر المنشورات غير المعتمدة", () => {
    const sql = db();
    // دوال القراءة الخمس + تفاعلاتها لازم تشترط status = 'approved'
    const matches = sql.match(/status = 'approved'/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(8);
  });

  it("API الإشراف: طابور الموافقات + إجراء review_post", () => {
    const api = read("app/api/admin/community/moderation/route.ts");
    expect(api).toContain("mod_list_pending_posts");
    expect(api).toContain("pendingPosts");
    expect(api).toContain('"review_post"');
    expect(api).toContain("mod_review_post");
  });

  it("واجهة الإشراف: تاب طابور الموافقة بأزرار موافقة/رفض", () => {
    const ui = read("app/admin/community/moderation/ModerationClient.tsx");
    expect(ui).toContain('"queue"');
    expect(ui).toContain("pendingPosts");
    expect(ui).toContain("review_post");
    expect(ui).toContain("موافقة ونشر");
  });

  it("الإنفاذ: المنشورات والرسايل بيتم فحصهم بالمساعد + تقييد حسب الخطورة", () => {
    const enforcement = read("lib/community/content-enforcement.ts");
    expect(enforcement).toContain("enforceContentViolation");
    expect(enforcement).toContain("mod_issue_action");
    expect(enforcement).toContain("threat");
    expect(read("app/api/community/posts/route.ts")).toContain("enforceContentViolation");
    const msg = read("app/api/conversations/[id]/message/route.ts");
    expect(msg).toContain("community_text_has_blocked_word");
    expect(msg).toContain("enforceContentViolation");
  });

  it("الكومبوزر بيعلن إن المنشور هينزل بعد الموافقة", () => {
    const composer = read("components/community/CommunityComposer.tsx");
    expect(composer).toContain("pendingNote");
    expect(composer).toContain("بعد موافقة الإشراف");
  });
});

describe("C16 — المسابقات المخصصة", () => {
  it("db/118 موجود", () => {
    expect(existsSync(join(root, "db/118-community-competitions.sql"))).toBe(true);
  });

  it("db/118: جداول + RLS + مصدر كوينز custom_quiz", () => {
    const sql = read("db/118-community-competitions.sql");
    expect(sql).toContain("create table if not exists public.community_competitions");
    expect(sql).toContain("create table if not exists public.community_competition_attempts");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("values ('custom_quiz', 50, 2, true)");
    // إصلاح فرع تحقق challenge الناقص في award_coins
    expect(sql).toContain("when 'challenge' then");
    expect(sql).toContain("when 'custom_quiz' then");
  });

  it("db/118: تصحيح المحاولة سيرفر سايد + محاولة واحدة لكل مستخدم", () => {
    const sql = read("db/118-community-competitions.sql");
    expect(sql).toContain("unique (competition_id, user_id)");
    expect(sql).toContain("submit_competition_attempt");
    expect(sql).toContain("get_competition_questions");
    // أسئلة اللعب بدون الإجابات الصحيحة
    expect(sql).toContain("'q', q ->> 'q', 'options', q -> 'options'");
    expect(sql.match(/get_competition_questions/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("db/118: إنشاء المسابقة للأدمن فقط (is_site_admin)", () => {
    const sql = read("db/118-community-competitions.sql");
    expect(sql).toContain("admin_create_competition");
    expect(sql).toContain("is_site_admin()");
  });

  it("API بانى المسابقات: guard بصلاحية community.moderate + توليد Magic AI", () => {
    const api = read("app/api/admin/community/quiz-builder/route.ts");
    expect(api).toContain("community.moderate");
    expect(api).toContain("admin_create_competition");
    expect(api).toContain("completeChatWithProviderFallback");
    expect(api).toContain("sanitizeQuestions");
  });

  it("واجهة الطلاب: تاب مسابقات المجتمع في صفحة المسابقات + مكوّن اللعب", () => {
    const page = read("app/community/competitions/page.tsx");
    expect(page).toContain('"customs"');
    expect(page).toContain("CustomCompetitions");
    const comp = read("components/community/CustomCompetitions.tsx");
    expect(comp).toContain("active_community_competitions");
    expect(comp).toContain("get_competition_questions");
    expect(comp).toContain("submit_competition_attempt");
  });

  it("صفحة بناء المسابقات محمية سيرفر سايد داخل المجتمع", () => {
    const page = read("app/community/moderation/competitions/page.tsx");
    expect(page).toContain("community.moderate");
    expect(page).toContain("QuizBuilderClient");
  });
});
