/**
 * عقد migration الحزم (db/117 — D-M-03/D-M-06/D-M-10/D-M-11) — static
 * contract. بيمسك أي رجوع يفكّ ذرّية منح المكونات (خصم كوينز على حزمة
 * فشل مكون من مكوناتها) أو حزمة فاضية أو عنصر مش موجود جواها.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { CATALOG, itemById } from "@/lib/shop/catalog";
import { CATEGORIES } from "@/lib/shop/types";

const root = join(__dirname, "..");
const sql = readFileSync(join(root, "db", "117-bundles.sql"), "utf8").replace(/\r\n/g, "\n");

describe("db/117 — نوع useful 'bundle'", () => {
  it("فرع bundle موجود في purchase_item", () => {
    expect(sql).toContain("v_useful_type = 'bundle'");
  });

  it("الحزمة الفاضية ممنوعة — لازم عناصر أو entitlements", () => {
    expect(sql).toContain("حزمة فاضية");
  });

  it("كل مكون لازم يكون موجود في shop_catalog", () => {
    const check = sql.indexOf("الحزمة فيها عنصر مش موجود");
    const join = sql.indexOf("left join public.shop_catalog sc on sc.id = c.id");
    expect(check).toBeGreaterThan(-1);
    expect(join).toBeGreaterThan(-1);
  });

  it("منح المكونات في نفس المعاملة بعد الخصم — فشل المنحة = rollback (D-M-03)", () => {
    const grant = sql.indexOf("v_useful_type = 'bundle' then\n    insert into public.shop_inventory");
    const coinSpend = sql.indexOf("insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata)");
    expect(grant).toBeGreaterThan(-1);
    expect(coinSpend).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(coinSpend);
  });

  it("عناصر الحزمة اللي معاك من قبل بتتخطى من غير استرداد فرق", () => {
    expect(sql).toContain("on conflict (user_id, item_id) do nothing");
  });

  it("entitlements الحزمة لازم تكون ليستة + بتمنح في نفس المعاملة", () => {
    expect(sql).toContain("entitlements لازم تكون ليستة");
    expect(sql).toContain("jsonb_array_elements(v_ents) as e");
  });
});

describe("db/117 — الحزم الثلاث (مرآة الكتالوج)", () => {
  const BUNDLES = [
    { id: "shop.bundle-starter", price: 600, credits: null as number | null },
    { id: "shop.bundle-collector", price: 1500, credits: null as number | null },
    { id: "shop.bundle-study", price: 1200, credits: 60 },
  ];

  it("الثلاث موجودين في db/117 بنفس الأسعار", () => {
    for (const b of BUNDLES) {
      expect(sql).toContain(
        `'${b.id}', null, ${b.price}, ${b.credits === null ? "null" : b.credits},`,
      );
    }
  });

  it("نفس الثلاث في الكتالوج بنفس الأسعار والنوع — الكتالوج مرآة للجدول", () => {
    for (const b of BUNDLES) {
      const item = itemById(b.id);
      expect(item, b.id).toBeDefined();
      expect(item!.price).toBe(b.price);
      expect(item!.creditsPrice).toBe(b.credits ?? undefined);
      expect(item!.category).toBe("bundles");
      expect(item!.metadata && (item!.metadata.useful as { type?: string })?.type).toBe("bundle");
    }
  });

  it("سعر الحزمة أقل من مجموع مكوناتها — دي فكرة الحزمة", () => {
    const components: Record<string, string[]> = {
      "shop.bundle-starter": ["avatar.dolphin", "frame.corners", "title.regular"],
      "shop.bundle-collector": ["companion.ghost", "companion.robot", "frame.glow"],
    };
    for (const [id, parts] of Object.entries(components)) {
      const bundle = itemById(id)!;
      const total = parts.reduce((sum, pid) => sum + (itemById(pid)?.price ?? 0), 0);
      expect(bundle.price, id).toBeLessThan(total);
    }
  });

  it("مكونات الحزم كلها موجودة في الكتالوج — الحزمة ممنوع تشاور على عنصر ضايع", () => {
    for (const item of CATALOG.filter((i) => (i.metadata?.useful as { type?: string } | undefined)?.type === "bundle")) {
      const useful = item.metadata?.useful as { items?: string[] } | undefined;
      const items: string[] = useful?.items ?? [];
      for (const pid of items) {
        expect(itemById(pid), `${item.id} → ${pid}`).toBeDefined();
      }
    }
  });

  it("قسم bundles معرّف في CATEGORIES وله 3 عناصر", () => {
    expect(CATEGORIES).toContain("bundles");
    expect(CATALOG.filter((i) => i.category === "bundles").length).toBe(3);
  });
});
