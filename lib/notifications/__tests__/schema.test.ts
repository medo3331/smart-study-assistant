import { describe, it, expect } from 'vitest';
import { isNotificationsSchemaMissing } from '../schema';

describe('notifications schema detection', () => {
  it('detects PostgREST missing table error by code', () => {
    expect(isNotificationsSchemaMissing({ code: 'PGRST205', message: 'no matter' })).toBe(true);
  });

  it('detects Postgres undefined table by code', () => {
    expect(isNotificationsSchemaMissing({ code: '42P01', message: 'relation "public.notifications" does not exist' })).toBe(true);
  });

  it('detects missing table by message', () => {
    expect(isNotificationsSchemaMissing({ code: null, message: "Could not find the table 'public.notifications' in the schema cache" })).toBe(true);
  });

  it('does not flag unrelated errors', () => {
    expect(isNotificationsSchemaMissing({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(isNotificationsSchemaMissing(null)).toBe(false);
  });
});
