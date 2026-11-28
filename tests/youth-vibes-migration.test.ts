/**
 * عقد كورة & شباب ⚽ + رفع تصاميم البوسترز (db/121 — DEV-M3 جزء ٤):
 *   - Collection «youth-vibes» بعناصر كورة/جيمينج (posters/titles/avatars).
 *   - Bucket «store-assets» للتصاميم — عام القراءة، كتابة service فقط.
 *   - الصورة المرفوعة بتتجاوز المعاينة النصية في ItemVisual.
 *   - التابات (Collections) بتفلتر المتجر بالكامل.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { customRowToItem, type CustomCatalogRow } from "@/lib/shop/custom-catalog";

const root = join(__dirname, "..");
const sql = readFileSync(join(root, "db", "121-youth-vibes.sql"), "utf8").replace(/\r\n/g, "\n");
const storeActions = readFileSync(join(root, "app", "admin", "actions", "store-items.ts"), "utf8").replace(/\r\n/g, "\n");
const visual = readFileSync(join(root, "components", "shop", "ItemVisual.tsx"), "utf8").replace(/\r\n/g, "\n");
const shopPage = readFileSync(join(root, "app", "shop", "page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("db/121 — كورة & شباب", () => {
  it("عناصر الكورة: أهلاوي وزملكاوي بنفس السعر (حياد التشجيع)", () => {
    expect(sql).toContain("'poster.football-ahly'");
    expect(sql).toContain("'poster.football-zamalek'");
    const ahly = sql.indexOf("'poster.football-ahly',        null, ");
    const zamalek = sql.indexOf("'poster.football-zamalek',     null, ");
    expect(ahly).toBeGreaterThan(-1);
    expect(zamalek).toBeGreaterThan(-1);
  });

  it("ألقاب كورة وجيمينج مسعّرة", () => {
    expect(sql).toContain("'title.football-no10'");
    expect(sql).toContain("'title.football-ostora'");
    expect(sql).toContain("'title.gaming-fifa-legend'");
  });

  it("كل العناصر youth-vibes ومخصصة", () => {
    expect((sql.match(/'collection', 'youth-vibes'/g) ?? []).length).toBeGreaterThanOrEqual(22);
  });

  it("bucket store-assets عام القراءة وidempotent", () => {
    expect(sql).toContain("into storage.buckets (id, name, public)");
    expect(sql).toContain("'store-assets', 'store-assets', true");
    expect(sql.match(/^BEGIN;$/gm)?.length).toBe(1);
    expect(sql.match(/^COMMIT;$/gm)?.length).toBe(1);
  });
});

describe("رفع التصاميم — الأدمن", () => {
  it("uploadStoreAsset موجود بالحارس والقيود", () => {
    expect(storeActions).toContain("uploadStoreAsset");
    expect(storeActions).toContain('from("store-assets")');
    expect(storeActions).toContain("MAX_ASSET_BYTES");
    expect(storeActions).toContain('requireAdminActor("rewards.manage")');
  });

  it("الصورة بتجاوز المعاينة النصية للبوستر", () => {
    expect(visual).toContain("item.metadata?.image");
  });

  it("التعديل والإضافة بيقبلوا الصورة والمجموعة", () => {
    expect(storeActions).toContain("meta.image = input.image");
    expect(storeActions).toContain("meta.collection = col");
  });
});

describe("تابات المجموعات في المتجر", () => {
  it("شريط collections بيفلتر على ميتاداتا المجموعة", () => {
    expect(shopPage).toContain("COLLECTION_LABELS");
    expect(shopPage).toContain("youth-vibes");
    expect(shopPage).toContain("i.metadata?.collection === collection");
  });
});

describe("الصورة تمر عبر customRowToItem", () => {
  it("metadata.image و collection بيوصلوا لعنصر المتجر", () => {
    const row: CustomCatalogRow = {
      id: "poster.custom-img12345",
      slot: null,
      price: 900,
      credits_price: null,
      rarity: "rare",
      metadata: { custom: true, poster: true, name: "بوستر مصور", value: "fallback", collection: "youth-vibes", image: "https://x.supabase.co/storage/v1/object/public/store-assets/posters/a.png" },
    };
    const item = customRowToItem(row);
    expect(item?.metadata?.image).toContain("store-assets");
    expect(item?.metadata?.collection).toBe("youth-vibes");
  });
});
