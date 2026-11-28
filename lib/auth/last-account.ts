/**
 * ذاكرة آخر حساب حقيقي سجّل دخول على هذا المتصفح — أساس «الدخول السريع».
 *
 * القواعد:
 *  - localStorage (مش session): المستخدم يقفل المتصفح ويرجع يلاقي حسابه متذكّر.
 *  - بيقرأه صفحة اللوجين والـ Hero — بس لتسهيل التعبئة والـ UI، مش لتجاوز كلمة السر.
 *  - cache على مستوى الموديول عشان getSnapshot بتاع useSyncExternalStore
 *    يرجّع نفس الـ reference في كل مرة.
 */

const LAST_ACCOUNT_KEY = "ssa_last_account";

export interface LastAccount {
  email: string;
  name: string;
}

let cache: LastAccount | null | undefined;

export function readLastAccount(): LastAccount | null {
  if (typeof window === "undefined") return null;
  if (cache !== undefined) return cache;
  try {
    const raw = window.localStorage.getItem(LAST_ACCOUNT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<LastAccount>) : null;
    cache =
      parsed && typeof parsed.email === "string" && parsed.email.includes("@")
        ? { email: parsed.email, name: typeof parsed.name === "string" ? parsed.name : "" }
        : null;
  } catch {
    cache = null;
  }
  return cache;
}

export function saveLastAccount(account: { email: string; name?: string }): void {
  try {
    const next: LastAccount = { email: account.email, name: account.name ?? "" };
    window.localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify(next));
    cache = next;
  } catch {
    // التخزين مقفول — الدخول السريع يتعطّل والتسجيل يكمّل عادي
  }
}

export function clearLastAccount(): void {
  try {
    window.localStorage.removeItem(LAST_ACCOUNT_KEY);
  } catch {}
  cache = undefined;
}
