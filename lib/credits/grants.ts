/**
 * منطق المنح — نقي وقابل للاختبار (بلا Supabase وبلا Next).
 *
 * يُستخدم في `lib/admin/grants.ts` (القراءة) وفي
 * `app/admin/actions/grants-manage.ts` (التحقق قبل الكتابة).
 */

export type GrantStatus = "active" | "expired" | "exhausted";

export type GrantLike = {
  remaining: number | null;
  expires_at: string | null;
};

/** مصادر المنح اليدوي المسموح بها من لوحة الأدمن. */
export const MANUAL_GRANT_SOURCES = ["manual", "bonus", "trial"] as const;
export type ManualGrantSource = (typeof MANUAL_GRANT_SOURCES)[number];

/** حدود صارمة للمنح اليدوي — تمنع الأخطاء البشرية والأرقام الشاذة. */
export const MAX_MANUAL_GRANT = 10_000;
export const MIN_EXPIRY_DAYS = 1;
export const MAX_EXPIRY_DAYS = 365;
export const DEFAULT_EXPIRY_DAYS = 90;
export const MAX_NOTES_LENGTH = 500;

/**
 * حالة المنحة مشتقة دائمًا من البيانات، لا تُخزَّن:
 *   المنتهية أولًا (حتى لو بقي منها رصيد)، ثم المستنفدة، ثم النشطة.
 */
export function grantStatus(grant: GrantLike, now: Date = new Date()): GrantStatus {
  const remaining = typeof grant.remaining === "number" ? grant.remaining : 0;
  const expiresAt = grant.expires_at ? Date.parse(grant.expires_at) : Number.NaN;
  if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) return "expired";
  if (remaining <= 0) return "exhausted";
  return "active";
}

/** هل المنحة تنتهي خلال `days` يومًا (وهي نشطة)؟ */
export function isExpiringSoon(
  grant: GrantLike,
  days: number = 7,
  now: Date = new Date()
): boolean {
  if (grantStatus(grant, now) !== "active") return false;
  const expiresAt = grant.expires_at ? Date.parse(grant.expires_at) : Number.NaN;
  if (!Number.isFinite(expiresAt)) return false;
  const horizon = now.getTime() + Math.max(0, days) * 24 * 60 * 60 * 1000;
  return expiresAt > now.getTime() && expiresAt <= horizon;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test((value ?? "").trim());
}

export type ManualGrantInput = {
  userId: string;
  amount: number;
  source: string;
  expiresInDays: number;
  notes?: string | null;
};

export type ManualGrantCheck =
  | { ok: true; value: Required<Omit<ManualGrantInput, "notes">> & { notes: string | null } }
  | { ok: false; errors: string[] };

/** تحقّق كامل من مدخلات المنح اليدوي — يعيد كل الأخطاء مجتمعة. */
export function validateManualGrant(input: ManualGrantInput): ManualGrantCheck {
  const errors: string[] = [];

  const userId = (input?.userId ?? "").trim();
  if (!isUuid(userId)) errors.push("user_id: لازم UUID صحيح");

  const amount = Number(input?.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    errors.push("amount: عدد صحيح أكبر من صفر");
  } else if (amount > MAX_MANUAL_GRANT) {
    errors.push(`amount: أقصى قيمة ${MAX_MANUAL_GRANT}`);
  }

  const source = (input?.source ?? "").trim();
  if (!(MANUAL_GRANT_SOURCES as readonly string[]).includes(source)) {
    errors.push(`source: لازم واحد من ${MANUAL_GRANT_SOURCES.join(" / ")}`);
  }

  const days = Number(input?.expiresInDays);
  if (!Number.isInteger(days) || days < MIN_EXPIRY_DAYS || days > MAX_EXPIRY_DAYS) {
    errors.push(`expires_in_days: عدد صحيح بين ${MIN_EXPIRY_DAYS} و${MAX_EXPIRY_DAYS}`);
  }

  const notes = typeof input?.notes === "string" ? input.notes.trim() : "";
  if (notes.length > MAX_NOTES_LENGTH) {
    errors.push(`notes: أقصى ${MAX_NOTES_LENGTH} حرفًا`);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      userId,
      amount,
      source,
      expiresInDays: days,
      notes: notes === "" ? null : notes,
    },
  };
}

/** تاريخ الانتهاء من عدد الأيام — ISO للاستخدام في RPC. */
export function expiryFromDays(days: number, now: Date = new Date()): string {
  const ms = Math.max(MIN_EXPIRY_DAYS, Math.trunc(days)) * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + ms).toISOString();
}
