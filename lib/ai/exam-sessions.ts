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
  params: { mode: ExamSessionMode; lectureIds: string[] }
): Promise<Result<CreateSessionResult>> {
  if (!params.lectureIds || params.lectureIds.length === 0) {
    return { ok: false, error: 'lectureIds required', code: 'VALIDATION' };
  }
  if (params.lectureIds.length > 3) {
    return { ok: false, error: 'max 3 lectures per session', code: 'VALIDATION' };
  }
  if (params.mode !== 'last_minute_review') {
    return { ok: false, error: 'invalid mode', code: 'VALIDATION' };
  }

  const { data, error } = await supabase.rpc('create_exam_session_with_reserve', {
    p_mode: params.mode,
    p_lecture_ids: params.lectureIds,
  });

  if (error) {
    if (error.message.includes('not authenticated')) {
      return { ok: false, error: error.message, code: 'UNAUTHENTICATED' };
    }
    if (error.message.includes('not found or not owned')) {
      return { ok: false, error: 'one or more lectures not owned', code: 'NOT_OWNED' };
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
