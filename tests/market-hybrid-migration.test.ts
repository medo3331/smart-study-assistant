/**
 * عقد migration التسعير المختلط (db/116 — D-M-03/D-M-10/D-M-11) — static
 * contract. بيمسك أي رجوع يفكّ الذرّية (خصم كوينز قبل تحقق الكريدت) أو
 * يفتح الـ view بدون security_involer قبل ما يوصل للإنتاج.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { CATALOG, itemById } from "@/lib/shop/catalog";
import { CATEGORIES } from "@/lib/shop/types";

const root = join(__dirname, "..");
const sql = readFileSync(join(root, "db", "116-market-hybrid.sql"), "utf8").replace(/\r\n/g, "\n");

describe("db/116 — التسعير المختلط (D-M-11)", () => {
  it("credits_price عمود additive + قيد موجب", () => {
    expect(sql).toContain("add column if not exists credits_price int");
    expect(sql).toContain("check (credits_price is null or credits_price > 0)");
  });

  it("شراء هجين: تحقق الكريدت **قبل** أي خصم — الذرّية (D-M-03)", () => {
    const creditCheck = sql.indexOf("رصيد الكريدت مش كفاية");
    const coinSpend = sql.indexOf("insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata)");
    expect(creditCheck).toBeGreaterThan(-1);
    expect(coinSpend).toBeGreaterThan(creditCheck);
  });

  it("خصم الكريدت في نفس الدالة — reason hybrid_purchase بمرجع مشترك", () => {
    expect(sql).toContain("'hybrid_purchase'");
    expect(sql).toContain("v_purchase_ref");
  });

  it("purchase_item نفس التوقيع (spent, balance) — الكلاينت الحالي يشتغل", () => {
    expect(sql).toContain("returns table (spent int, balance int)");
  });

  it("معالجة useful (entitlement/ai_credit) موجودة — إصلاح النسخة الحية القديمة", () => {
    expect(sql).toContain("public.entitlements");
    expect(sql).toContain("'store_purchase'");
  });

  it("anon ممنوع من purchase_item", () => {
    expect(sql).toContain("revoke all on function public.purchase_item(text) from public, anon;");
  });
});

describe("db/116 — سجل المشتريات (D-M-10)", () => {
  it("view فوق coin_ledger مش جدول مكرر + security_invoker (الـ RLS بتطبق)", () => {
    expect(sql).toContain("create or replace view public.shop_purchase_history");
    expect(sql).toContain("with (security_invoker = true)");
    expect(sql).not.toContain("create table if not exists public.coin_orders");
    expect(sql).not.toContain("create table if not exists public.coin_products");
  });
});

describe("db/116 — منتجات Learning Store (مرآة الكتالوج)", () => {
  const HYBRIDS = [
    { id: "learning.ai-exam-experience", price: 500, credits: 30 },
    { id: "learning.ai-advanced-review", price: 1000, credits: 50 },
    { id: "learning.magic-persona-plus", price: 1200, credits: 75 },
    { id: "learning.smart-review-pack", price: 2000, credits: 100 },
  ];

  it("الأربع موجودين في db/116 بنفس الأسعار", () => {
    for (const h of HYBRIDS) {
      expect(sql).toContain(`'${h.id}', null, ${h.price}, ${h.credits},`);
    }
  });

  it("نفس الأربع في الكتالوج بنفس الأسعار — الكتالوج مرآة للجدول", () => {
    for (const h of HYBRIDS) {
      const item = itemById(h.id);
      expect(item, h.id).toBeDefined();
      expect(item!.price).toBe(h.price);
      expect(item!.creditsPrice).toBe(h.credits);
    }
  });

  it("قسم learning معرّف في CATEGORIES وله عناصر", () => {
    expect(CATEGORIES).toContain("learning");
    expect(CATALOG.filter((i) => i.category === "learning").length).toBe(4);
  });
});
