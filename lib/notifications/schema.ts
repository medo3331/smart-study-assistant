export const NOTIFICATIONS_TABLE = 'notifications';

export interface SupabaseLikeError {
  code?: string | null;
  message?: string | null;
}

export function isNotificationsSchemaMissing(error: SupabaseLikeError | null | undefined): boolean {
  if (!error) return false;
  const code = (error.code || '').toUpperCase();
  const message = (error.message || '').toLowerCase();
  if (code === 'PGRST205' || code === '42P01') return true;
  if (message.includes('could not find the table')) return true;
  if (message.includes('does not exist') && message.includes('relation')) return true;
  if (message.includes('schema cache')) return true;
  return false;
}

export const NOTIFICATIONS_SCHEMA_MISSING_MESSAGE =
  'Notifications are not available in this environment yet.';
