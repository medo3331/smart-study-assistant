/* ==========================================================================
   🎫 upload tickets — الربط بين تذكرة الرفع ومالكها (Design Doc v3)
   ═══════════════════════════════════════════════════════════════════════

   **سيرفر بس.** الملف ده بيمسك service client — ممنوع أي استيراد من
   كومبوننت كلاينت. كل الدوال بتاخد العميل مُمرَّر (قابلة للاختبار من
   غير ما نلمس process.env).

   التصميم (v3 — المعتمد):
     - ticket_id   = معرّف فقط. مش سر.
     - secret      = 32 بايت عشوائي (base64) للزائر بلا جلسة فقط.
                    بيتخزن **SHA-256 hash** في secret_hash، والسر نفسه
                    بيرجع مرة واحدة في رد /upload-url ومش بيتسجل في
                    أي لوج ولا أي رد خطأ.
     - claim_id    = UUID جديد لكل استحواذ. release/consume مشروطين بيه،
                     فطلب قديم مش بيفك ولا يستهلك تذكرة استحوذ عليها
                     طلب أحدث.
     - lease       = 12 دقيقة (مهلة المزوّد 5 د + حد الفانكشن 5 د + هامش).
                     ⚠️ توثيق صريح: claim_id **مش** بيمنع التكلفة
                     المزدوجة لو فانكشن اتقتلت في نص نداء ElevenLabs
                     والـ lease عدّى — إعادة المحاولة بتدفع تفريغة تانية
                     (مرة واحدة على الأكثر؛ بعدها consumed).

   الأخطاء: كل فشل تذكرة بيرمي TICKET_ERROR واحد موحد. **ممنوع** السر
   أو ticket_id أو path في أي رسالة أو لوج — الكود اللي بيبنص في اللوج
   هو الـ kind فقط ('invalid' | 'concurrent').
   ========================================================================== */

import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** التذكرة اللي بترجع لـ /upload-url (السر بيتصرف مرة واحدة هنا بس). */
export type IssuedTicket = {
  ticketId: string;
  /** السر الخام — للزائر بلا جلسة فقط. null لو التذكرة مربوطة بجلسة. */
  secret: string | null;
};

/** نتيجة claim ناجح — claim_id هو اللي بيمسك الطلب صاحب الاستحواذ. */
export type TicketClaim = {
  claimId: string;
};

/** خطأ تذكرة موحد — الراوت بترجمه لـ 404 (أو 423 لو concurrent). */
export class TicketError extends Error {
  readonly kind: "invalid" | "concurrent";

  constructor(kind: "invalid" | "concurrent") {
    super(kind === "invalid" ? "الطلب ده مالوش صلاحية." : "فيه عملية تحويل جارية.");
    this.name = "TicketError";
    this.kind = kind;
  }
}

/** lease الاستحواذ: 12 دقيقة — أكبر من أي حد تنفيذ فعلي في المسار. */
const LEASE_MS = 12 * 60 * 1000;

/** عمر رابط الرفع الموقّع = 2 ساعة (نفس UPLOAD_URL_TTL_SECONDS) — التذكرة بتعيش معاه. */
const TICKET_TTL_SQL = "now() + interval '2 hours'";

/** توليد سر 32 بايت base64url — للزائر بلا جلسة. */
export function generateTicketSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 للسر — ده الوحيد اللي بيتخزن في الداتابيز. */
export function hashTicketSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/* ─────────────────────────── issue ─────────────────────────── */

/**
 * يسجّل تذكرة جديدة مربوطة بالمسار.
 *
 * - لو فيه جلسة (مسجل أو anonymous): owner_user_id = userId، مفيش سر.
 * - زائر بلا جلسة: owner_user_id = null + secret_hash، والسر بيرجع خام.
 *
 * التنظيف الاحتمالي (~5%) بيتنفذ هنا — دفعة 200 كحد أقصى، بعد 7 أيام
 * من انتهاء الصلاحية (استبقاء للتحقيق في الإساءة). بيفشل بهدوء:
 * التنظيف مش شرط لعمل التذكرة.
 */
export async function issueTicket(
  service: SupabaseClient,
  input: { storagePath: string; ownerUserId: string | null },
): Promise<IssuedTicket> {
  const owned = input.ownerUserId !== null;
  const secret = owned ? null : generateTicketSecret();

  const { error } = await service.from("upload_tickets").insert({
    storage_path: input.storagePath,
    owner_user_id: input.ownerUserId,
    secret_hash: owned ? null : hashTicketSecret(secret as string),
    status: "active",
    expires_at: TICKET_TTL_SQL,
  });

  if (error) throw new TicketError("invalid");

  // تنظيف احتمالي محدود الدفعات — بهدوء.
  if (Math.random() < 0.05) {
    void cleanupExpiredTickets(service).catch(() => {});
  }

  return { ticketId: "", secret };
}

/** تنظيف التذاكر المنتهية من أكتر من 7 أيام — دفعة 200 كحد أقصى. */
async function cleanupExpiredTickets(service: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // دفعة محدودة: نقرا 200 أقدم صف مؤهل ونحذفهم بـ IN — مش DELETE غير محدود.
  const { data: stale, error: selectError } = await service
    .from("upload_tickets")
    .select("ticket_id")
    .lt("expires_at", cutoff)
    .order("expires_at", { ascending: true })
    .limit(200);
  if (selectError || !stale || stale.length === 0) return;
  await service
    .from("upload_tickets")
    .delete()
    .in("ticket_id", stale.map((row) => row.ticket_id as string));
}

/* ─────────────────────────── claim ─────────────────────────── */

/**
 * استحواذ ذري على التذكرة قبل أي قراءة للملف أو نداء ElevenLabs.
 *
 * الشروط كلها في UPDATE واحد (لا check-then-act):
 *   - ticket_id + storage_path متطابقين (ربط المسار بالتذكرة).
 *   - expires_at > now() (الصلاحية).
 *   - الهوية صريحة — ممنوع الخلط بين الأنواع:
 *       * تذكرة مملوكة → نفس الجلسة فقط.
 *       * تذكرة سر (زائر بلا جلسة) → مطابقة SHA-256 للسر المُرسَل.
 *   - status = 'active'، أو 'processing' انتهى lease بتاعه (12 دقيقة)
 *     — إعادة الاستحواذ بعد lease منتهي مسموحة عشان "حاول تاني" يشتغل.
 *
 * يرمي:
 *   TicketError('concurrent') → مالك صح بس فيه تفريغ جاري (423).
 *   TicketError('invalid')    → أي حاجة تانية (404 الموحدة — مفيش كشف
 *                               وجود تذكرة لمستخدم تاني).
 */
export async function claimTicket(
  service: SupabaseClient,
  input: {
    ticketId: string;
    storagePath: string;
    claimant: { userId: string | null; secret: string | null };
  },
): Promise<TicketClaim> {
  const claimId = randomUUID();
  const leaseCutoff = new Date(Date.now() - LEASE_MS).toISOString();

  // الهوية: فرعان صريحان — مفيش IS NULL OR =? اللي بيسمح بالخلط.
  const isOwnedTicket = input.claimant.userId !== null && input.claimant.secret === null;
  const isSecretTicket = input.claimant.userId === null && input.claimant.secret !== null;

  // الشرط المشترك (باقي الهوية بيتحقق بالفرعين تحت — supabase-js مش
  // بيدعم OR المركّب في single update بسهولة، فبنعملها بشرطين منفصلين).
  const base = {
    ticket_id: input.ticketId,
    storage_path: input.storagePath,
    expires_at: null, // placeholder — بينضاف كشرط lt('now') تحت
  };
  void base; // الشكل النهائي مبني بالـ builder تحت

  const ownedMatch = isOwnedTicket
    ? service
        .from("upload_tickets")
        .update({
          status: "processing",
          claim_id: claimId,
          processing_started_at: new Date().toISOString(),
        })
        .eq("ticket_id", input.ticketId)
        .eq("storage_path", input.storagePath)
        .eq("owner_user_id", input.claimant.userId as string)
        .is("secret_hash", null)
        .gt("expires_at", new Date().toISOString())
    : null;

  const secretMatch = isSecretTicket
    ? service
        .from("upload_tickets")
        .update({
          status: "processing",
          claim_id: claimId,
          processing_started_at: new Date().toISOString(),
        })
        .eq("ticket_id", input.ticketId)
        .eq("storage_path", input.storagePath)
        .is("owner_user_id", null)
        .eq("secret_hash", hashTicketSecret(input.claimant.secret as string))
        .gt("expires_at", new Date().toISOString())
    : null;

  const branch = ownedMatch ?? secretMatch;
  if (!branch) throw new TicketError("invalid");

  // فرع الحالة: active، أو processing انتهى lease بتاعه.
  const { data: claimed, error } = await branch
    .or(
      [
        `status.eq.active`,
        `status.eq.processing,processing_started_at.lt.${leaseCutoff}`,
      ].join(","),
    )
    .select("claim_id")
    .single();

  if (error || !claimed) {
    // هل ده "مش مالكك" ولا "تزامن من مالكك"؟ الـ 423 بيرجع **بس** بعد
    // تأكيد الملكية — لازم قراءة تانية مشروطه بالهوية نفسها.
    if (await isOwnedAndBusy(service, input)) throw new TicketError("concurrent");
    throw new TicketError("invalid");
  }

  return { claimId: claimed.claim_id as string };
}

/** فحص "المالك الصح بس فيه تفريغ جاري" — بعد فشل الـ claim فقط. */
async function isOwnedAndBusy(
  service: SupabaseClient,
  input: {
    ticketId: string;
    storagePath: string;
    claimant: { userId: string | null; secret: string | null };
  },
): Promise<boolean> {
  const leaseCutoff = new Date(Date.now() - LEASE_MS).toISOString();
  let query = service
    .from("upload_tickets")
    .select("ticket_id")
    .eq("ticket_id", input.ticketId)
    .eq("storage_path", input.storagePath)
    .gt("expires_at", new Date().toISOString())
    .eq("status", "processing")
    .gt("processing_started_at", leaseCutoff);

  if (input.claimant.userId !== null && input.claimant.secret === null) {
    query = query.eq("owner_user_id", input.claimant.userId);
  } else if (input.claimant.userId === null && input.claimant.secret !== null) {
    query = query.is("owner_user_id", null).eq("secret_hash", hashTicketSecret(input.claimant.secret as string));
  } else {
    return false; // خلط أنواع → invalid مش concurrent (مفيش كشف)
  }
  const { data } = await query.maybeSingle();
  return Boolean(data);
}

/* ─────────────────────── release / consume ─────────────────────── */

/**
 * فك الاستحواذ عند فشل مؤقت (شبكة/مزوّد) — **مشروط بـ claim_id بتاع
 * الطلب نفسه**: طلب قديم (claim سابق) مش بيفك تذكرة استحوذ عليها طلب
 * أحدث. فشل الفك بيتجاهل — الـ lease هو شبكة الأمان.
 */
export async function releaseTicket(
  service: SupabaseClient,
  input: { claimId: string },
): Promise<void> {
  await service
    .from("upload_tickets")
    .update({ status: "active", claim_id: null, processing_started_at: null })
    .eq("claim_id", input.claimId)
    .eq("status", "processing")
    .then();
}

/**
 * استهلاك التذكرة عند **نجاح التفريغ نفسه** — حتى لو الحفظ في قاعدة
 * البيانات فشل بعدها. السبب: النص وصّل للطالب فعلاً (بيرجع في الرد)،
 * فإعادة "حاول تاني" على نفس التذكرة معناها تفريغة مدفوعة تانية على
 * نص هو شايفه قدامه. بعد consume، "حاول تاني" = "ارفع من جديد" (404).
 *
 * مشروط بـ claim_id — طلب قديم مش بيستهلك استحواذ أحدث.
 */
export async function consumeTicket(
  service: SupabaseClient,
  input: { claimId: string },
): Promise<void> {
  await service
    .from("upload_tickets")
    .update({ status: "consumed", consumed_at: new Date().toISOString() })
    .eq("claim_id", input.claimId)
    .eq("status", "processing")
    .then();
}
