/* ==========================================================================
   🎫 upload tickets — الربط بين تذكرة الرفع ومالكها (Design Doc v3)
   ═══════════════════════════════════════════════════════════════════════

   **سيرفر بس.** الملف ده بيمسك service client — ممنوع أي استيراد من
   كومبوننت كلاينت. كل الدوال بتاخد العميل مُمرَّر (قابلة للاختبار من
   غير ما نلمس process.env).

   التصميم (v3 — المعتمد):
     - ticket_id   = معرّف فقط. مش سر.
     - secret      = 32 بايت عشوائي (base64url) للزائر بلا جلسة فقط.
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

   الـ claim بمحاولتين UPDATE ذريتين متتاليتين (مش or() واحدة):
     PostgREST or-string مع timestamp ISO فيه نقطة عشرية (".000Z")
     بتكسر فصل field.op.value — فبدل المغامرة بصيغة مركّبة، كل محاولة
     UPDATE مستقلة وذرية بمعناها الواضح:
       محاولة ١: status = 'active'
       محاولة ٢: status = 'processing' AND processing_started_at < lease cutoff
     لو الاتنين رجعوا صفر صفوف → مالك مشغول (423) أو invalid (404).

   الأخطاء: كل فشل تذكرة بيرمي TicketError موحد. **ممنوع** السر أو
   ticket_id أو path في أي رسالة أو لوج — الـ kind فقط هو اللي
   بيتسجل ('invalid' | 'concurrent').
   ========================================================================== */

import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** عمر التذكرة: 2 ساعة — نفس عمر الـ signed upload URL في
 *  transcription-storage.ts (UPLOAD_URL_TTL_SECONDS). محسوبة بالـ JS
 *  (مش SQL string) عشان تمرر قيمة ISO حقيقية لـ supabase-js. */
const TICKET_TTL_MS = 2 * 60 * 60 * 1000;

/** lease الاستحواذ: 12 دقيقة — أكبر من أي حد تنفيذ فعلي في المسار
 *  (مهلة ElevenLabs 5 د + maxDuration الفانكشن 5 د + هامش). */
export const LEASE_MS = 12 * 60 * 1000;

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

/** هوية المطالب بالتذكرة — فرعان صريحان، الخلط بينهم = invalid. */
export type TicketClaimant =
  | { userId: string; secret: null }
  | { userId: null; secret: string };

/** خطأ تذكرة موحد — الراوت بترجمه لـ 404 (أو 423 لو concurrent).
 *  الرسالة عامة عن قصد: مش بتفرق بين "مش موجودة" و"مش بتاعتك"
 *  و"منتهية" و"مستهلكة" — عشان مفيش كشف وجود تذكرة لمستخدم تاني. */
export class TicketError extends Error {
  readonly kind: "invalid" | "concurrent";

  constructor(kind: "invalid" | "concurrent") {
    super(kind === "invalid" ? "الطلب ده مالوش صلاحية. ارفع المحاضرة من جديد وحاول تاني." : "فيه عملية تحويل جارية على الملف ده. استنى تخلص.");
    this.name = "TicketError";
    this.kind = kind;
  }
}

/**
 * عقد سلسلة فلاتر الـ UPDATE — بينا隔离نا عن generics بتاعة supabase-js
 * بتعريف محلي بسيط. أي تغيير في الأعمدة بيظهر هنا أولًا في الـ typecheck.
 */
type TicketUpdateChain = {
  eq(column: string, value: unknown): TicketUpdateChain;
  is(column: string, value: string | null): TicketUpdateChain;
  gt(column: string, value: string): TicketUpdateChain;
  lt(column: string, value: string): TicketUpdateChain;
  select(columns: string): {
    maybeSingle(): Promise<{ data: { claim_id: string } | null; error: unknown }>;
  };
};

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

  const { data, error } = await service
    .from("upload_tickets")
    .insert({
      storage_path: input.storagePath,
      owner_user_id: input.ownerUserId,
      secret_hash: owned ? null : hashTicketSecret(secret as string),
      status: "active",
      expires_at: new Date(Date.now() + TICKET_TTL_MS).toISOString(),
    })
    // الـ ticket_id بيتولّد في الداتابيز (default) — لازم نقراه بنفس النداء.
    .select("ticket_id")
    .single();

  if (error || !data?.ticket_id) throw new TicketError("invalid");

  // تنظيف احتمالي محدود الدفعات — بهدوء، مش شرط لنجاح الإصدار.
  if (Math.random() < 0.05) {
    void cleanupExpiredTickets(service).catch(() => {});
  }

  return { ticketId: data.ticket_id as string, secret };
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
 * استحواذ على التذكرة قبل أي قراءة للملف أو نداء ElevenLabs.
 *
 * محاولتين UPDATE ذريتين متتاليتين (كل واحدة لوحدها ذرية على مستوى
 * الصف — مفيش check-then-act):
 *   محاولة ١: status = 'active' — الحالة الطبيعية.
 *   محاولة ٢: status = 'processing' AND processing_started_at < lease
 *              cutoff — إعادة استحواذ بعد فانكشن ماتت والـ lease عدّى.
 *
 * الشروط المشتركة في كل محاولة (كلها في الـ UPDATE نفسه):
 *   - ticket_id + storage_path متطابقين (ربط المسار بالتذكرة).
 *   - expires_at > now() (الصلاحية).
 *   - الهوية صريحة — ممنوع الخلط بين الأنواع:
 *       * تذكرة مملوكة (مسجل/anonymous) → نفس الجلسة فقط.
 *       * تذكرة سر (زائر بلا جلسة) → مطابقة SHA-256 للسر المُرسَل.
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
    claimant: TicketClaimant;
  },
): Promise<TicketClaim> {
  const claimId = randomUUID();
  const now = new Date().toISOString();
  const leaseCutoff = new Date(Date.now() - LEASE_MS).toISOString();

  /** السلسلة المفلترة بالهوية — كل محاولة بتبني سلسلة جديدة. */
  const identityFiltered = (): TicketUpdateChain => {
    const base = service
      .from("upload_tickets")
      .update({
        status: "processing",
        claim_id: claimId,
        processing_started_at: now,
      })
      .eq("ticket_id", input.ticketId)
      .eq("storage_path", input.storagePath)
      .gt("expires_at", now) as unknown as TicketUpdateChain;

    // فرعان صريحان — مفيش IS NULL OR =? اللي بيسمح بالخلط بين الأنواع.
    if (input.claimant.userId !== null && input.claimant.secret === null) {
      return base.eq("owner_user_id", input.claimant.userId).is("secret_hash", null);
    }
    if (input.claimant.userId === null && input.claimant.secret !== null) {
      return base
        .is("owner_user_id", null)
        .eq("secret_hash", hashTicketSecret(input.claimant.secret));
    }
    // خلط أنواع (جلسة + سر مع بعض، ولا الاتنين) → invalid.
    throw new TicketError("invalid");
  };

  // محاولة ١: الحالة الطبيعية.
  const attemptActive = await identityFiltered()
    .eq("status", "active")
    .select("claim_id")
    .maybeSingle();
  if (attemptActive.data?.claim_id) {
    return { claimId: attemptActive.data.claim_id };
  }

  // محاولة ٢: استحواذ جديد بعد انتهاء الـ lease (فانكشن ماتت ونص).
  const attemptLease = await identityFiltered()
    .eq("status", "processing")
    .lt("processing_started_at", leaseCutoff)
    .select("claim_id")
    .maybeSingle();
  if (attemptLease.data?.claim_id) {
    return { claimId: attemptLease.data.claim_id };
  }

  // هل ده "تزامن من مالك صح" ولا "مش مالكك/مش موجودة"؟ الـ 423
  // بيرجع **بس** بعد تأكيد الملكية — مفيش كشف وجود لحد تاني.
  if (await isOwnedAndBusy(service, input)) throw new TicketError("concurrent");
  throw new TicketError("invalid");
}

/** فحص "المالك الصح بس فيه تفريغ جاري" — بعد فشل الـ claim فقط. */
async function isOwnedAndBusy(
  service: SupabaseClient,
  input: {
    ticketId: string;
    storagePath: string;
    claimant: TicketClaimant;
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
    query = query
      .is("owner_user_id", null)
      .eq("secret_hash", hashTicketSecret(input.claimant.secret));
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
