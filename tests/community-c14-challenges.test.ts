/**
 * عقد C14 — تحديات المجتمع
 * ثابت على: migration الجداول + RPCs + API + تاب التحديات في صفحة المسابقات
 * + prefill الهاشتاج في الكومبوزر.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("db/116-community-challenges.sql", () => {
  const sql = read("db/116-community-challenges.sql");

  it("الجداول مقفولة (RLS بدون سياسات) — الوصول عبر RPCs فقط", () => {
    expect(sql).toContain("alter table public.community_challenges        enable row level security");
    expect(sql).toContain("alter table public.community_challenge_entries enable row level security");
  });

  it("مصدر الكوينز challenge مسجّل بدون كتابة فوق قرارات الاقتصاد", () => {
    expect(sql).toMatch(/insert into public\.coin_source_rules[\s\S]*'challenge', 50, 1, true[\s\S]*on conflict \(id\) do nothing/);
  });

  it("التتبّع التلقائي: trigger على الهاشتاج بيسجّل المشاركة من المنشورات العامة فقط", () => {
    expect(sql).toContain("trg_post_hashtag_links_challenges");
    expect(sql).toContain("v_post.visibility <> 'public'");
  });

  it("اختيار الفائز للأدمن بس (نفس نمط C4)", () => {
    expect(sql).toContain("pick_challenge_winner");
    expect(sql).toMatch(/if not public\.is_site_admin\(\) and coalesce\(auth\.role\(\), ''\) <> 'service_role' then/);
  });

  it("تحديات جاهزة مزروعة (ملخص / سؤال / 7 أيام)", () => {
    expect(sql).toContain("summary-showdown");
    expect(sql).toContain("question-master");
    expect(sql).toContain("study-streak");
  });
});

describe("API + UI", () => {
  it("API التحديات: قائمة + join + leaderboard عبر الـRPCs", () => {
    const api = read("app/api/community/challenges/route.ts");
    expect(api).toContain('rpc("active_community_challenges")');
    expect(api).toContain('rpc("join_community_challenge"');
    expect(api).toContain('rpc("challenge_leaderboard"');
  });

  it("صفحة المسابقات: تاب التحديات + جائزة كوينز + لوحة صدارة التحدي", () => {
    const page = read("app/community/competitions/page.tsx");
    expect(page).toContain('"challenges"');
    expect(page).toContain("/api/community/challenges");
    expect(page).toContain("reward_coins");
    expect(page).toContain('action: "leaderboard"');
  });

  it("الكومبوزر بيقرا ?hashtag= من لينكات التحديات ويفتح جاهز", () => {
    const composer = read("components/community/CommunityComposer.tsx");
    expect(composer).toContain('get("hashtag")');
    expect(composer).toContain('setKind("challenge")');
  });
});
