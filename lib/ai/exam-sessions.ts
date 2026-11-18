/**
 * Exam Engine — typed wrappers over the 7 exam_session RPCs.
 *
 * All functions return Result<T> = { ok: true, data } | { ok: false, error, code? }
 * Callers map to HTTP:
 *   - validation error  → 400
 *   - not authenticated → 401
 *   - not owned         → 404
 *   - conflict/busy     → 423
 *   - budget exceeded   → 429
 *   - provider/db error → 500
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export type ExamSessionMode = 'last_minute_review';
export type ExamSessionStatus =
  | 'created'
  | 'generating'
  | 'ready'
  | 'completed'
  | 'failed'
  | 'abandoned';
export type ExamItemStatus =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'canceled';

export interface CreateSessionResult {
  session_id: string;
  status: ExamSessionStatus;
  credit_reserved_at: string;
  total_chars: number;
  total_chunks: number;
  estimated_tokens: number;
}

export interface ClaimedItem {
  id: string;
  claim_token: string;
  lease_expires_at: string;
  attempt_count: number;
  status: ExamItemStatus;
}

export type ClaimOutcome =
  | { kind: 'claimed'; item: ClaimedItem }
  | { kind: 'already_ready'; state: ItemState }
  | { kind: 'busy'; state: ItemState }
  | { kind: 'exhausted'; state: ItemState };

export interface ItemState {
  id: string;
  status: ExamItemStatus;
  attempt_count: number;
  claimed_at: string | null;
  lease_expires_at: string | null;
  is_claimed: boolean;
  is_ready: boolean;
  result_json: Record<string, unknown> | null;
}

export interface UsageIncrement {
  logical_calls_used: number;
  provider_attempts_used: number;
  allowed: boolean;
  reason: string;
}

// ────────────────────────────────────────────────────────────
// 1. createExamSession
// ────────────────────────────────────────────────────────────
export async function createExamSession(
  supabase: SupabaseClient,
  params: {
    mode: ExamSessionMode;
    lectureIds: string[];
    documentIds?: string[];
    /** 🌍 موضوع عام (نص) — مصدر بديل: امتحان من معلومات الـAI العامة. */
    topic?: string;
  }
): Promise<Result<CreateSessionResult>> {
  const lectureIds = (params.lectureIds ?? []).filter((id) => typeof id === 'string' && id.length > 0);
  const documentIds = (params.documentIds ?? []).filter((id) => typeof id === 'string' && id.length > 0);
  // 🌍 الموضوع العام — نص مُنضَّف (اتنين لـ300 حرف).
  const topic = typeof params.topic === 'string' ? params.topic.trim().replace(/\s+/g, ' ') : '';

  if (lectureIds.length === 0 && documentIds.length === 0 && topic === '') {
    return { ok: false, error: 'lectureIds, documentIds or topic required', code: 'VALIDATION' };
  }
  // ⚠️ **الموضوع لوحده**: جلسة كاملة من غير ملفات (مصدر واحد).
  //    ماينفعش نخلطه بمصادر تانية — الـRPC بيبني جلسة واحدة بمصدر واحد.
  if (topic !== '' && (lectureIds.length > 0 || documentIds.length > 0)) {
    return { ok: false, error: 'topic cannot be combined with other sources', code: 'VALIDATION' };
  }
  if (topic !== '' && (topic.length < 3 || topic.length > 300)) {
    return { ok: false, error: 'topic must be 3..300 chars', code: 'VALIDATION' };
  }
  // ⚠️ **السقف 3 مصادر** (مش 3 محاضرات) — موزوع بين المحاضرات والمستندات.
  if (lectureIds.length + documentIds.length > 3) {
    return { ok: false, error: 'max 3 sources per session', code: 'VALIDATION' };
  }
  if (params.mode !== 'last_minute_review') {
    return { ok: false, error: 'invalid mode', code: 'VALIDATION' };
  }

  // ────────────────────────────────────────────────────────────
  // 🌍 مصدر واحد: موضوع عام (من غير أي ملف)
  // ────────────────────────────────────────────────────────────
  if (topic !== '') {
    const { data, error } = await supabase.rpc('create_exam_session_with_topic_reserve', {
      p_mode: params.mode,
      p_topic: topic,
    });

    if (error) {
      if (isMissingRpc(error) || isSchemaLevelError(error)) {
        // ⚠️ الـmigration 50 لسه متطبّقةش ⇒ رسالة صريحة (مش 500).
        console.error(
          '[exam-sessions] create_exam_session_with_topic_reserve unavailable —',
          { code: error.code, message: error.message }
        );
        return {
          ok: false,
          error: 'topic exam is not available yet (migration 50 not applied)',
          code: 'TOPIC_UNAVAILABLE',
        };
      }
      return mapCreateError(error);
    }

    return finishCreate(data);
  }

  // ⚠️ **الـRPC الجديد (محاضرات + مستندات)** بيتبني بـ`db/49-exam-documents.sql`
  //    (تطبيق يدوي على القاعدة). لو مش موجود ⇒ الخطأ 42883 (undefined_function)
  //    ⇒ بنرجع للـRPC القديم (محاضرات بس) عشان المسار القديم ما يكسرش.
  const { data, error } = await supabase.rpc('create_exam_session_with_sources_reserve', {
    p_mode: params.mode,
    p_lecture_ids: lectureIds,
    p_document_ids: documentIds,
  });

  if (error && isMissingRpc(error)) {
    if (documentIds.length > 0) {
      // مستندات + الـRPC مش موجود ⇒ رسالة صريحة (مش 500 غامض).
      return {
        ok: false,
        error: 'exam documents source is not available yet (migration 49 not applied)',
        code: 'SOURCES_UNAVAILABLE',
      };
    }
    const fallback = await supabase.rpc('create_exam_session_with_reserve', {
      p_mode: params.mode,
      p_lecture_ids: lectureIds,
    });
    if (fallback.error) return mapCreateError(fallback.error);
    return finishCreate(fallback.data);
  }

  // 🛟 **شبكة أمان**: الـRPC الجديد موجود بس فيه خطأ **مستوى المخطط**
  //    (مثل bug الـ`array_length` ⇒ 23502 not-null) ⇒ بنرجع للـRPC القديم
  //    (محاضرات بس) عشان المسار القديم يفضل شغال فورًا.
  //
  // ⚠️ الـfallback **للمحاضرات بس**: المستندات محتاجة الـRPC الجديد
  //    (المصلّح) ⇒ لو المستندات موجودة بنرجع رسالة صريحة مش 500.
  if (error && isSchemaLevelError(error)) {
    console.error(
      '[exam-sessions] create_exam_session_with_sources_reserve failed at schema level —',
      { code: error.code, message: error.message }
    );
    if (documentIds.length > 0) {
      return {
        ok: false,
        error: 'exam documents source is not available yet (migration 49 needs re-apply)',
        code: 'SOURCES_UNAVAILABLE',
      };
    }
    const fallback = await supabase.rpc('create_exam_session_with_reserve', {
      p_mode: params.mode,
      p_lecture_ids: lectureIds,
    });
    if (!fallback.error) return finishCreate(fallback.data);
    return mapCreateError(fallback.error);
  }

  if (error) {
    return mapCreateError(error);
  }

  return finishCreate(data);
}

/**
 * الـRPC مش موجود في القاعدة — يعني الـmigration (49) لسه متطبّقةش.
 *
 * ⚠️ **الأكواد اللي بنشوفها**:
 *   - `42883`  = undefined_function (أораكل/Postgres).
 *   - `PGRST202` = «Could not find the function … in the schema cache»
 *     ← ده اللي بيرجعه **Supabase/PostgREST** فعلاً (اللي بنستخدمه).
 *     ⚠️ لو ما اتعاملناش معاه ⇒ **كل إنشاء امتحان بيرجع 500**-production.
 *
 * ⚠️ **ليه fallback**: المسار القديم (محاضرات بس) لازم يشتغل زي ما كان،
 *    حتى لو الـmigration لسه على الـstaging/production.
 */
function isMissingRpc(error: { code?: string; message?: string }): boolean {
  if (error.code === '42883' || error.code === 'PGRST202') return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('undefined_function') ||
    message.includes('could not find the function') ||
    message.includes('does not exist')
  );
}

/**
 * العمود مش موجود في الجدول (schema drift) — الـmigration لسه متطبّقةش.
 *
 * ⚠️ **الأكواد**: `42703` (undefined_column) · `PGRST204` («Could not find the
 *    'document_id' column» من PostgREST).
 */
export function isMissingColumnError(error: { code?: string; message?: string }): boolean {
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('column') &&
    (message.includes('does not exist') || message.includes('not found in schema'))
  );
}

/**
 * خطأ **مستوى المخطط/الدالة** — مش خطأ المستخدم ولا الميزانية.
 *
 * ⚠️ **ليه مهم**: الـRPC الجديد (db/49) كان فيه bug في `array_length`
 *    (بيرجّع NULL للمصفوفة الفاضية) ⇒ `total_lectures` بتبقى NULL ⇒
 *    انتهاك `not null` ⇒ **500 عند إنشاء أي امتحان**. ده خطأ **مخطط**،
 *    فبنعرفه وبنتعامل معاه (fallback / رسالة واضحة) بدل 500 غامض.
 *
 * ⚠️ **الأكواد**: `23502` (not_null_violation) · `42883` · `42703` ·
 *    `42P01` (undefined_table) · `PGRST202`/`PGRST204`/`PGRST205`.
 */
export function isSchemaLevelError(error: { code?: string; message?: string }): boolean {
  if (
    error.code === "23502" ||
    error.code === "42883" ||
    error.code === "42703" ||
    error.code === "42P01" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205"
  ) {
    return true;
  }
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("null value in column") ||
    message.includes("violates not-null constraint") ||
    message.includes("could not find the function")
  );
}

/** صف بند جلسة (الحقول الاختياريةDependent على الـmigration). */
export type ExamSessionItemRow = {
  id: string;
  lecture_id: string | null;
  document_id?: string | null;
  /** 🌍 الموضوع العام (db/50) — مصدر بديل للحصة/المستند. */
  topic?: string | null;
  ordinal: number;
  status: ExamItemStatus;
  attempt_count?: number;
  transcript_chars?: number | null;
  chunk_count?: number | null;
  result_json?: unknown;
  error_code?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

/** مستوى الدعم في القاعدة: المستندات؟ الموضوع العام؟ */
export type ExamSchemaSupport = {
  documentSupport: boolean;
  topicSupport: boolean;
};

/**
 * يقرأ بنود الجلسة **بشكل مستقل عن الـschema**.
 *
 * ⚠️ **ليه**: بعد إضافة `document_id` (db/49) و`topic` (db/50) لازم
 *    الاستعلام يفضل شغال لو الـmigration لسه متطبّقةش ⇒ PostgREST بيرجّع
 *    42703 ⇒ **500 في كل مسار الامتحان** (إنشاء/قراءة/توليد). فبنجرب
 *    الأعمدة بالتدريج (الأحدث فالأقدم) لحد ما نلاقي حاجة شغالة.
 *
 * ⚠️ `documentSupport = false` ⇒ القاعدة لسه قبل الـmigration ⇒ البنود
 *    كلها محاضرات. نفس المنطق لـ`topicSupport`.
 */
export async function selectSessionItems(
  supabase: SupabaseClient,
  params: { sessionId: string; userId: string; columns?: string }
): Promise<{ rows: ExamSessionItemRow[] } & ExamSchemaSupport & { error: unknown }> {
  const base = params.columns ?? 'id, lecture_id, ordinal, status';

  // ① الأحدث: مستندات + موضوع عام (db/50).
  const full = await supabase
    .from('exam_session_items')
    .select(`${base}, document_id, topic`)
    .eq('session_id', params.sessionId)
    .eq('user_id', params.userId)
    .order('ordinal', { ascending: true });

  if (!full.error) {
    // ⚠️ cast عبر `unknown`: الـselect مبني من متغير فـTS بيستنتج نوع
    //    غريب (ParserError[]) — والمشروع مافيش أنواع Supabase مولّدة.
    return {
      rows: ((full.data ?? []) as unknown) as ExamSessionItemRow[],
      documentSupport: true,
      topicSupport: true,
      error: null,
    };
  }

  // ② وسط: مستندات بس (db/49 متطبّقة، 50 لأ).
  if (isMissingColumnError(full.error)) {
    const withDocument = await supabase
      .from('exam_session_items')
      .select(`${base}, document_id`)
      .eq('session_id', params.sessionId)
      .eq('user_id', params.userId)
      .order('ordinal', { ascending: true });

    if (!withDocument.error) {
      console.warn(
        '[exam-sessions] topic column missing (migration 50 not applied) — falling back'
      );
      return {
        rows: ((withDocument.data ?? []) as unknown) as ExamSessionItemRow[],
        documentSupport: true,
        topicSupport: false,
        error: null,
      };
    }

    if (isMissingColumnError(withDocument.error)) {
      // ③ الأقدم: محاضرات بس.
      console.warn(
        '[exam-sessions] document_id column missing (migration 49 not applied) — falling back',
        withDocument.error.message
      );
      const legacy = await supabase
        .from('exam_session_items')
        .select(base)
        .eq('session_id', params.sessionId)
        .eq('user_id', params.userId)
        .order('ordinal', { ascending: true });
      return {
        rows: ((legacy.data ?? []) as unknown) as ExamSessionItemRow[],
        documentSupport: false,
        topicSupport: false,
        error: legacy.error ?? null,
      };
    }

    return {
      rows: [],
      documentSupport: false,
      topicSupport: false,
      error: withDocument.error,
    };
  }

  return { rows: [], documentSupport: false, topicSupport: false, error: full.error };
}

/**
 * يقرأ بند واحد (للراوت المعالجة) — **مستقل عن الـschema** مثل الأعلى.
 */
export async function selectExamItem(
  supabase: SupabaseClient,
  params: { sessionId: string; itemId: string; userId: string }
): Promise<{ item: ExamSessionItemRow | null } & ExamSchemaSupport & { error: unknown }> {
  // ① الأحدث: مستندات + موضوع عام (db/50).
  const full = await supabase
    .from('exam_session_items')
    .select('id, session_id, lecture_id, document_id, topic, status')
    .eq('id', params.itemId)
    .eq('session_id', params.sessionId)
    .eq('user_id', params.userId)
    .maybeSingle();

  if (!full.error) {
    return {
      item: (full.data ?? null) as ExamSessionItemRow | null,
      documentSupport: true,
      topicSupport: true,
      error: null,
    };
  }

  if (isMissingColumnError(full.error)) {
    // ② مستندات بس (db/49 متطبّقة، 50 لأ).
    const withDocument = await supabase
      .from('exam_session_items')
      .select('id, session_id, lecture_id, document_id, status')
      .eq('id', params.itemId)
      .eq('session_id', params.sessionId)
      .eq('user_id', params.userId)
      .maybeSingle();

    if (!withDocument.error) {
      console.warn(
        '[exam-sessions] topic column missing (migration 50 not applied) — falling back'
      );
      return {
        item: (withDocument.data ?? null) as ExamSessionItemRow | null,
        documentSupport: true,
        topicSupport: false,
        error: null,
      };
    }

    if (isMissingColumnError(withDocument.error)) {
      // ③ محاضرات بس.
      console.warn(
        '[exam-sessions] document_id column missing (migration 49 not applied) — falling back',
        withDocument.error.message
      );
      const legacy = await supabase
        .from('exam_session_items')
        .select('id, session_id, lecture_id, status')
        .eq('id', params.itemId)
        .eq('session_id', params.sessionId)
        .eq('user_id', params.userId)
        .maybeSingle();
      return {
        item: (legacy.data ?? null) as ExamSessionItemRow | null,
        documentSupport: false,
        topicSupport: false,
        error: legacy.error ?? null,
      };
    }

    return { item: null, documentSupport: false, topicSupport: false, error: withDocument.error };
  }

  return { item: null, documentSupport: false, topicSupport: false, error: full.error };
}

/** ترجمة خطأ الـRPC ل نتيجة typed (نفس خرائط الراوت). */
function mapCreateError(error: { message: string }): Result<CreateSessionResult> {
  if (error.message.includes('not authenticated')) {
    return { ok: false, error: error.message, code: 'UNAUTHENTICATED' };
  }
  if (error.message.includes('not found or not owned')) {
    return { ok: false, error: 'one or more sources not owned', code: 'NOT_OWNED' };
  }
  if (
    error.message.includes('exceeds limit') ||
    error.message.includes('out of range')
  ) {
    return { ok: false, error: error.message, code: 'BUDGET' };
  }
  if (error.message.includes('insufficient') || error.message.includes('quota')) {
    return { ok: false, error: error.message, code: 'INSUFFICIENT_CREDITS' };
  }
  return { ok: false, error: error.message, code: 'DB_ERROR' };
}

/** يحوّل رد الـRPC لنتيجة (مع فحص الرد الفاضي). */
function finishCreate(data: unknown): Result<CreateSessionResult> {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { ok: false, error: 'empty response from RPC', code: 'DB_ERROR' };
  }
  return { ok: true, data: row as CreateSessionResult };
}

// ────────────────────────────────────────────────────────────
// 2. claimItem
// ────────────────────────────────────────────────────────────
export async function claimItem(
  supabase: SupabaseClient,
  params: { sessionId: string; itemId: string; maxAttempts?: number }
): Promise<Result<ClaimOutcome>> {
  const { data, error } = await supabase.rpc('claim_exam_session_item', {
    p_session_id: params.sessionId,
    p_item_id: params.itemId,
    p_max_attempts: params.maxAttempts ?? 2,
  });

  if (error) {
    if (error.message.includes('not authenticated')) {
      return { ok: false, error: error.message, code: 'UNAUTHENTICATED' };
    }
    return { ok: false, error: error.message, code: 'DB_ERROR' };
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) {
    // Conflict — disambiguate via get_state
    const state = await getItemState(supabase, params.itemId);
    if (!state.ok) return state;

    if (state.data.is_ready) {
      return { ok: true, data: { kind: 'already_ready', state: state.data } };
    }
    if (state.data.is_claimed) {
      return { ok: true, data: { kind: 'busy', state: state.data } };
    }
    return { ok: true, data: { kind: 'exhausted', state: state.data } };
  }

  return { ok: true, data: { kind: 'claimed', item: rows[0] as ClaimedItem } };
}

// ────────────────────────────────────────────────────────────
// 3. renewLease
// ────────────────────────────────────────────────────────────
export async function renewLease(
  supabase: SupabaseClient,
  params: { itemId: string; claimToken: string }
): Promise<Result<boolean>> {
  const { data, error } = await supabase.rpc('renew_exam_session_lease', {
    p_item_id: params.itemId,
    p_claim_token: params.claimToken,
  });

  if (error) return { ok: false, error: error.message, code: 'DB_ERROR' };
  return { ok: true, data: data === true };
}

// ────────────────────────────────────────────────────────────
// 4. saveResult
// ────────────────────────────────────────────────────────────
export async function saveResult(
  supabase: SupabaseClient,
  params: {
    itemId: string;
    claimToken: string;
    result: Record<string, unknown>;
    transcriptChars?: number;
    chunkCount?: number;
  }
): Promise<Result<boolean>> {
  if (!params.result || typeof params.result !== 'object') {
    return { ok: false, error: 'result must be a JSON object', code: 'VALIDATION' };
  }

  const { data, error } = await supabase.rpc('save_exam_session_result', {
    p_item_id: params.itemId,
    p_claim_token: params.claimToken,
    p_result_json: params.result,
    p_transcript_chars: params.transcriptChars ?? null,
    p_chunk_count: params.chunkCount ?? null,
  });

  if (error) return { ok: false, error: error.message, code: 'DB_ERROR' };
  return { ok: true, data: data === true };
}

// ────────────────────────────────────────────────────────────
// 5. failItem
// ────────────────────────────────────────────────────────────
export async function failItem(
  supabase: SupabaseClient,
  params: {
    itemId: string;
    claimToken: string;
    errorCode: string;
    errorMessage: string;
  }
): Promise<Result<boolean>> {
  const { data, error } = await supabase.rpc('fail_exam_session_item', {
    p_item_id: params.itemId,
    p_claim_token: params.claimToken,
    p_error_code: params.errorCode,
    p_error_message: params.errorMessage,
  });

  if (error) return { ok: false, error: error.message, code: 'DB_ERROR' };
  return { ok: true, data: data === true };
}

// ────────────────────────────────────────────────────────────
// 6. incrementUsage
// ────────────────────────────────────────────────────────────
export async function incrementUsage(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    logical?: number;
    attempts?: number;
    maxLogical?: number;
    maxAttempts?: number;
  }
): Promise<Result<UsageIncrement>> {
  const { data, error } = await supabase.rpc('increment_exam_session_usage', {
    p_session_id: params.sessionId,
    p_logical: params.logical ?? 0,
    p_attempts: params.attempts ?? 0,
    p_max_logical: params.maxLogical ?? 15,
    p_max_attempts: params.maxAttempts ?? 45,
  });

  if (error) return { ok: false, error: error.message, code: 'DB_ERROR' };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { ok: false, error: 'empty response from RPC', code: 'DB_ERROR' };
  }
  return { ok: true, data: row as UsageIncrement };
}

// ────────────────────────────────────────────────────────────
// 7. getItemState
// ────────────────────────────────────────────────────────────
export async function getItemState(
  supabase: SupabaseClient,
  itemId: string
): Promise<Result<ItemState>> {
  const { data, error } = await supabase.rpc('get_exam_session_item_state', {
    p_item_id: itemId,
  });

  if (error) return { ok: false, error: error.message, code: 'DB_ERROR' };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { ok: false, error: 'item not found or not owned', code: 'NOT_FOUND' };
  }
  return { ok: true, data: row as ItemState };
}
