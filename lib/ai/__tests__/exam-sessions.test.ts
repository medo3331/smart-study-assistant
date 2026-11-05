import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createExamSession,
  claimItem,
  renewLease,
  saveResult,
  failItem,
  incrementUsage,
  getItemState,
} from '../exam-sessions';

// ────────────────────────────────────────────────────────────
// Mock supabase
// ────────────────────────────────────────────────────────────
function makeMock() {
  return { rpc: vi.fn() } as unknown as { rpc: ReturnType<typeof vi.fn> };
}

const FAKE_SESSION = '11111111-1111-1111-1111-111111111111';
const FAKE_ITEM = '22222222-2222-2222-2222-222222222222';
const FAKE_TOKEN = '33333333-3333-3333-3333-333333333333';

// ────────────────────────────────────────────────────────────
// createExamSession
// ────────────────────────────────────────────────────────────
describe('createExamSession', () => {
  let supabase: ReturnType<typeof makeMock>;
  beforeEach(() => {
    supabase = makeMock();
  });

  it('rejects empty lectureIds', async () => {
    const r = await createExamSession(supabase as never, {
      mode: 'last_minute_review',
      lectureIds: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('VALIDATION');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects >3 lectures', async () => {
    const r = await createExamSession(supabase as never, {
      mode: 'last_minute_review',
      lectureIds: ['a', 'b', 'c', 'd'],
    });
    expect(r.ok).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects invalid mode', async () => {
    const r = await createExamSession(supabase as never, {
      mode: 'invalid' as never,
      lectureIds: ['a'],
    });
    expect(r.ok).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('maps "not authenticated" to UNAUTHENTICATED', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'not authenticated' },
    });
    const r = await createExamSession(supabase as never, {
      mode: 'last_minute_review',
      lectureIds: [FAKE_SESSION],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('UNAUTHENTICATED');
  });

  it('maps "not owned" to NOT_OWNED', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'one or more lectures not found or not owned' },
    });
    const r = await createExamSession(supabase as never, {
      mode: 'last_minute_review',
      lectureIds: [FAKE_SESSION],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_OWNED');
  });

  it('maps "exceeds limit" to BUDGET', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'total chars 80000 exceeds limit 60000' },
    });
    const r = await createExamSession(supabase as never, {
      mode: 'last_minute_review',
      lectureIds: [FAKE_SESSION],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('BUDGET');
  });

  it('returns session on success', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        {
          session_id: FAKE_SESSION,
          status: 'created',
          credit_reserved_at: '2026-11-04T10:00:00Z',
          total_chars: 20000,
          total_chunks: 2,
          estimated_tokens: 5000,
        },
      ],
      error: null,
    });
    const r = await createExamSession(supabase as never, {
      mode: 'last_minute_review',
      lectureIds: [FAKE_SESSION],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.session_id).toBe(FAKE_SESSION);
      expect(r.data.estimated_tokens).toBe(5000);
    }
  });
});

// ────────────────────────────────────────────────────────────
// claimItem
// ────────────────────────────────────────────────────────────
describe('claimItem', () => {
  let supabase: ReturnType<typeof makeMock>;
  beforeEach(() => {
    supabase = makeMock();
  });

  it('returns claimed when RPC returns a row', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: [
        {
          id: FAKE_ITEM,
          claim_token: FAKE_TOKEN,
          lease_expires_at: '2026-11-04T10:04:00Z',
          attempt_count: 1,
          status: 'processing',
        },
      ],
      error: null,
    });
    const r = await claimItem(supabase as never, {
      sessionId: FAKE_SESSION,
      itemId: FAKE_ITEM,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.kind).toBe('claimed');
  });

  it('returns already_ready when RPC returns 0 rows and state is_ready', async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: [], error: null }) // claim
      .mockResolvedValueOnce({
        data: [
          {
            id: FAKE_ITEM,
            status: 'ready',
            attempt_count: 1,
            claimed_at: null,
            lease_expires_at: null,
            is_claimed: false,
            is_ready: true,
            result_json: { summary: 'x' },
          },
        ],
        error: null,
      }); // get_state
    const r = await claimItem(supabase as never, {
      sessionId: FAKE_SESSION,
      itemId: FAKE_ITEM,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.kind).toBe('already_ready');
  });

  it('returns busy when claim returns 0 rows and state is_claimed', async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [
          {
            id: FAKE_ITEM,
            status: 'processing',
            attempt_count: 1,
            claimed_at: '2026-11-04T10:00:00Z',
            lease_expires_at: '2026-11-04T10:04:00Z',
            is_claimed: true,
            is_ready: false,
            result_json: null,
          },
        ],
        error: null,
      });
    const r = await claimItem(supabase as never, {
      sessionId: FAKE_SESSION,
      itemId: FAKE_ITEM,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.kind).toBe('busy');
  });

  it('returns exhausted when claim returns 0 rows and state is not_claimed not_ready', async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [
          {
            id: FAKE_ITEM,
            status: 'failed',
            attempt_count: 2,
            claimed_at: null,
            lease_expires_at: null,
            is_claimed: false,
            is_ready: false,
            result_json: null,
          },
        ],
        error: null,
      });
    const r = await claimItem(supabase as never, {
      sessionId: FAKE_SESSION,
      itemId: FAKE_ITEM,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.kind).toBe('exhausted');
  });
});

// ────────────────────────────────────────────────────────────
// renewLease
// ────────────────────────────────────────────────────────────
describe('renewLease', () => {
  let supabase: ReturnType<typeof makeMock>;
  beforeEach(() => {
    supabase = makeMock();
  });

  it('returns true when DB returns true', async () => {
    supabase.rpc.mockResolvedValue({ data: true, error: null });
    const r = await renewLease(supabase as never, {
      itemId: FAKE_ITEM,
      claimToken: FAKE_TOKEN,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(true);
  });

  it('returns false when token mismatch (DB returns false)', async () => {
    supabase.rpc.mockResolvedValue({ data: false, error: null });
    const r = await renewLease(supabase as never, {
      itemId: FAKE_ITEM,
      claimToken: FAKE_TOKEN,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// saveResult
// ────────────────────────────────────────────────────────────
describe('saveResult', () => {
  let supabase: ReturnType<typeof makeMock>;
  beforeEach(() => {
    supabase = makeMock();
  });

  it('rejects non-object result', async () => {
    const r = await saveResult(supabase as never, {
      itemId: FAKE_ITEM,
      claimToken: FAKE_TOKEN,
      result: null as never,
    });
    expect(r.ok).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('returns true when DB confirms', async () => {
    supabase.rpc.mockResolvedValue({ data: true, error: null });
    const r = await saveResult(supabase as never, {
      itemId: FAKE_ITEM,
      claimToken: FAKE_TOKEN,
      result: { summary: 'x', questions: [] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(true);
  });

  it('returns false when token mismatch (stale worker)', async () => {
    supabase.rpc.mockResolvedValue({ data: false, error: null });
    const r = await saveResult(supabase as never, {
      itemId: FAKE_ITEM,
      claimToken: FAKE_TOKEN,
      result: { summary: 'x' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// failItem
// ────────────────────────────────────────────────────────────
describe('failItem', () => {
  let supabase: ReturnType<typeof makeMock>;
  beforeEach(() => {
    supabase = makeMock();
  });

  it('returns true when DB confirms', async () => {
    supabase.rpc.mockResolvedValue({ data: true, error: null });
    const r = await failItem(supabase as never, {
      itemId: FAKE_ITEM,
      claimToken: FAKE_TOKEN,
      errorCode: 'PROVIDER_ERROR',
      errorMessage: 'timeout',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// incrementUsage
// ────────────────────────────────────────────────────────────
describe('incrementUsage', () => {
  let supabase: ReturnType<typeof makeMock>;
  beforeEach(() => {
    supabase = makeMock();
  });

  it('returns allowed=true when under limits', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        {
          logical_calls_used: 1,
          provider_attempts_used: 1,
          allowed: true,
          reason: 'ok',
        },
      ],
      error: null,
    });
    const r = await incrementUsage(supabase as never, {
      sessionId: FAKE_SESSION,
      logical: 1,
      attempts: 1,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.allowed).toBe(true);
  });

  it('returns allowed=false with logical_limit_reached', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        {
          logical_calls_used: 15,
          provider_attempts_used: 30,
          allowed: false,
          reason: 'logical_limit_reached',
        },
      ],
      error: null,
    });
    const r = await incrementUsage(supabase as never, {
      sessionId: FAKE_SESSION,
      logical: 1,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.allowed).toBe(false);
      expect(r.data.reason).toBe('logical_limit_reached');
    }
  });

  it('returns allowed=false with attempts_limit_reached', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        {
          logical_calls_used: 12,
          provider_attempts_used: 45,
          allowed: false,
          reason: 'attempts_limit_reached',
        },
      ],
      error: null,
    });
    const r = await incrementUsage(supabase as never, {
      sessionId: FAKE_SESSION,
      attempts: 3,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.reason).toBe('attempts_limit_reached');
  });
});

// ────────────────────────────────────────────────────────────
// getItemState
// ────────────────────────────────────────────────────────────
describe('getItemState', () => {
  let supabase: ReturnType<typeof makeMock>;
  beforeEach(() => {
    supabase = makeMock();
  });

  it('returns NOT_FOUND when empty', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null });
    const r = await getItemState(supabase as never, FAKE_ITEM);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });

  it('returns state on success', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        {
          id: FAKE_ITEM,
          status: 'ready',
          attempt_count: 1,
          claimed_at: null,
          lease_expires_at: null,
          is_claimed: false,
          is_ready: true,
          result_json: { summary: 'x' },
        },
      ],
      error: null,
    });
    const r = await getItemState(supabase as never, FAKE_ITEM);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.status).toBe('ready');
      expect(r.data.is_ready).toBe(true);
    }
  });
});
