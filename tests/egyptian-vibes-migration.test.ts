/**
 * عقد Egyptian Vibes 🇪🇬 (db/120 — DEV-M3 جزء ٣) — static contract:
 *   - قسم posters جديد في الأنواع والكتالوج.
 *   - البوسترز مخصصة (custom + poster) قابلة للتعديل من الأدمن.
 *   - الألقاب المصرية على خانة title بأسعار التصميم.
 *   - الأدمن يقدر يعدّل أي عنصر مخصوص (updateStoreItem) ويخفيه.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { CATEGORIES, CATEGORY } from "@/lib/shop/types";
import { customRowToItem, type CustomCatalogRow } from "@/lib/shop/custom-catalog";
import { itemById } from "@/lib/shop/catalog";

const root = join(__dirname, "..");
const sql = readFileSync(join(root, "db", "120-egyptian-vibes.sql"), "utf8").replace(/\r\n/g, "\n");
const storeActions = readFileSync(join(root, "app", "admin", "actions", "store-items.ts"), "utf8").replace(/\r\n/g, "\n");

function posterRow(overrides: Partial<CustomCatalogRow> = {}): CustomCatalogRow {
  return {
    id: "poster.custom-abc12345",
    slot: null,
    price: 800,
    credits_price: null,
    rarity: "uncommon",
    metadata: { custom: true, poster: true, name: "بوستر", desc: "", value: "هنلم المنهج" },
    ...overrides,
  };
}

describe("قسم البوسترز (posters)", () => {
  it("مسجّل كقسم رسمي بدون خانة تلبيس", () => {
    expect(CATEGORIES).toContain("posters");
    expect(CATEGORY.posters.slot).toBeNull();
  });
});

describe("db/120 — Egyptian Vibes", () => {
  it("الألقاب المصرية على خانة title", () => {
    expect(sql).toContain("('title.egyptian-king'");
    expect(sql).toContain("'title.egyptian-trying'");
    expect(sql).toContain("'الدحيح 🧠'");
  });

  it("الأسعار المعتمدة من التصميم", () => {
    expect(sql).toContain("('title.egyptian-king',              'title', 3000");
    expect(sql).toContain("('title.egyptian-ostura',            'title', 5000");
    expect(sql).toContain("('title.egyptian-trying',            'title',  500");
    expect(sql).toContain("('poster.egyptian-henlem',        null,  800");
  });

  it("كل العناصر مخصصة (custom) وتابعة للـ collection", () => {
    expect((sql.match(/'custom', true/g) ?? []).length).toBeGreaterThanOrEqual(50);
    expect((sql.match(/'collection', 'egyptian-vibes'/g) ?? []).length).toBeGreaterThanOrEqual(50);
  });

  it("البوسترز slot=null مع metadata.poster", () => {
    expect(sql).toContain("'poster', true");
  });

  it("idempotent — on conflict do update + معاملة واحدة", () => {
    expect(sql.match(/^BEGIN;$/gm)?.length).toBe(1);
    expect(sql.match(/^COMMIT;$/gm)?.length).toBe(1);
    expect((sql.match(/on conflict \(id\) do update set/g) ?? []).length).toBe(3);
  });
});

describe("قراءة العناصر المخصصة — البوسترز", () => {
  it("بوستر بيتحوّل لعنصر category=posters", () => {
    const item = customRowToItem(posterRow());
    expect(item).not.toBeNull();
    expect(item?.category).toBe("posters");
    expect(item?.value).toBe("هنلم المنهج");
  });

  it("صف slot=null من غير poster ميرجعش (أمان)", () => {
    expect(customRowToItem(posterRow({ metadata: { custom: true, name: "x", value: "y" } }))).toBeNull();
  });

  it("الإخفاء (active=false) بيخفي العنصر من المتجر", () => {
    expect(customRowToItem(posterRow({ metadata: { custom: true, poster: true, active: false, name: "x", value: "y" } }))).toBeNull();
  });
});

describe("أدوات الأدمن — التعديل", () => {
  it("updateStoreItem موجود بالحارس والـ audit", () => {
    expect(storeActions).toContain("updateStoreItem");
    expect(storeActions).toMatch(/update[\s\S]*requireAdminActor\("rewards.manage"\)|requireAdminActor\("rewards.manage"\)[\s\S]*update/);
    expect((storeActions.match(/recordAuditLog/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it("الإخفاء بيتم من الميتاداتا مش حذف", () => {
    expect(storeActions).toContain("nextMeta.active = input.active");
  });

  it("الحذف بيتحقق من custom من الجدول مش من شكل المعرّف", () => {
    expect(storeActions).toContain("metadata->>'custom' = 'true' RETURNING id");
  });
});
