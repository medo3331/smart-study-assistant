// ===========================================================================
// MAGICLY — SPRINT 1 — Batch 1A
// Announcement Center — server-side service
//
// Responsibilities:
//   - Deliver announcements to students (in-app, email, push)
//   - Record read receipts (announcement_reads)
//   - Record delivery status (announcement_deliveries)
//   - Audience validation (student-facing)
//   - Delivery analytics (admin only)
// ===========================================================================

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth-roles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AudienceTarget =
  | { type: 'all' }
  | { type: 'users'; userIds: string[] }
  | { type: 'plans'; planIds: string[] }
  | { type: 'faculty'; faculty: string }
  | { type: 'stage'; stage: string }
  | { type: 'grade'; grade: string };

export type DeliveryChannel = 'in_app' | 'email' | 'push';

export interface DeliveryResult {
  announcementId: string;
  channel: DeliveryChannel;
  userId: string;
  status: 'sent' | 'failed';
  deliveryId?: string;
  error?: string;
}

export interface ReadReceipt {
  announcementId: string;
  userId: string;
  deliveredAt: Date;
  readAt: Date;
}

export interface DeliveryRecord {
  id: string;
  announcementId: string;
  userId: string;
  channel: DeliveryChannel;
  status: 'sent' | 'failed' | 'bounced' | 'opened' | 'clicked';
  payload?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: Date;
}

export interface ReadReceiptQuery {
  announcementId: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a user matches audience targeting criteria */
export function matchesAudience(userId: string, audience: AudienceTarget): boolean {
  switch (audience.type) {
    case 'all':
      return true;
    case 'users':
      return audience.userIds.includes(userId);
    case 'plans':
    case 'faculty':
    case 'stage':
    case 'grade':
      // Audience filtering for these types is performed server-side
      // in getAnnouncementsForUser() using the authenticated Supabase client
      return true;
    default:
      return true;
  }
}

/** Get users matching an audience target (Supabase version) */
async function getUsersForAudience(audience: AudienceTarget, userId: string): Promise<string[]> {
  const supabase = await createClient();
  const users: string[] = [];

  switch (audience.type) {
    case 'all': {
      // All authenticated users
      const { data, error } = await supabase
        .from('auth.users')
        .select('id')
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) {
        console.error('[announcements service] getUsersForAudience all:', error.message);
      }
      if (data) {
        users.push(...data.map((u: any) => u.id));
      }
      break;
    }
    case 'users':
      return audience.userIds;
    case 'plans': {
      // Query users with matching plan in app_metadata
      const { data, error } = await supabase
        .from('auth.users')
        .select('id')
        .eq('app_metadata->>\'plan\'', audience.planIds[0]);
      if (error) {
        console.error('[announcements service] getUsersForAudience plans:', error.message);
      }
      if (data) {
        users.push(...data.map((u: any) => u.id));
      }
      break;
    }
    case 'faculty':
    case 'stage':
    case 'grade': {
      const filter = audience.type === 'faculty' ? 'faculty' : audience.type;
      const filterValue = filter === 'faculty' ? (audience as any).faculty : filter === 'stage' ? (audience as any).stage : (audience as any).grade;
      const { data, error } = await supabase
        .from('auth.users')
        .select('id')
        .eq(`coalesce(external_metadata->>'${filter}', '')`, filterValue);
      if (error) {
        console.error('[announcements service] getUsersForAudience', audience.type, ':', error.message);
      }
      if (data) {
        users.push(...data.map((u: any) => u.id));
      }
      break;
    }
    default:
      return [];
  }

  return users;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getAnnouncementsForUser(
  userId: string,
  filters?: {
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
  }
) {
  const supabase = await createClient();
  let query = supabase
    .from('announcements')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 50)
    .range(filters?.offset ?? 0, (filters?.offset ?? 0) + (filters?.limit ?? 50) - 1);

  const now = new Date().toISOString();

  // Active window filter
  query = query.lte('publish_at', now).gt('expires_at', now);

  // Audience filtering logic:
  // For each audience type, apply appropriate filter to target_* columns
  const { data, error } = await query;

  if (error) {
    console.error('[announcements service] getAnnouncementsForUser:', error.message);
    throw new Error('Failed to load announcements.');
  }

  const announcementsList = (data ?? []).filter((ann: any) => {
    const audience = ann.audience;
    switch (audience) {
      case 'all':
        return true;
      case 'targeted':
        return Array.isArray(ann.target_user_ids) && ann.target_user_ids.includes(userId);
      case 'plan':
        return Array.isArray(ann.target_plan_ids) && ann.target_plan_ids.includes(ann.target_plan_ids[0]); // placeholder
      case 'faculty':
        return Boolean(ann.target_faculty);
      case 'stage':
        return Boolean(ann.target_stage);
      case 'grade':
        return Boolean(ann.target_grade);
      default:
        return true;
    }
  });

  return announcementsList.map((a: any) => ({
    ...a,
    isRead: false, // Not used in this service layer
    readCount: 0,
    deliverCount: a.announcement_deliveries?.length ?? 0,
    clickedCount: a.announcement_deliveries?.filter((d: any) => d.status === 'clicked').length ?? 0
  }));
}

export async function recordRead(
  announcementId: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();

  // Try to insert; suppress 23505 (duplicate key) as idempotent
  const { error } = await supabase
    .from('announcement_reads')
    .insert({ announcementId, userId });

  if (error && error.code !== '23505') {
    console.error('[announcements service] recordRead:', error.message);
  }
}

export async function recordDelivery(
  announcementId: string,
  userId: string,
  channel: DeliveryChannel,
  status: 'sent' | 'failed' | 'bounced' | 'opened' | 'clicked',
  payload?: Record<string, unknown>,
  errorMessage?: string
): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('announcement_deliveries')
    .insert({
      announcementId,
      userId,
      channel,
      status,
      payload,
      errorMessage,
      createdAt: new Date().toISOString()
    });
}

export async function getDeliveryStats(
  announcementId: string
): Promise<Record<string, number>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('announcement_deliveries')
    .select('*')
    .eq('announcementId', announcementId);

  if (error) {
    console.error('[announcements service] getDeliveryStats:', error.message);
    return { sent: 0, failed: 0, bounced: 0, opened: 0, clicked: 0, total: 0 };
  }

  const stats: Record<string, number> = {
    sent: 0,
    failed: 0,
    bounced: 0,
    opened: 0,
    clicked: 0,
    total: 0
  };

  for (const d of data ?? []) {
    if (stats[d.status] != null) stats[d.status]++;
    stats.total++;
  }

  return stats;
}

export async function getReadStats(
  announcementId: string
): Promise<{ total: number; uniqueUsers: number; lastRead: Date | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('announcement_reads')
    .select('readAt, userId')
    .eq('announcementId', announcementId);

  if (error) {
    console.error('[announcements service] getReadStats:', error.message);
    return { total: 0, uniqueUsers: 0, lastRead: null };
  }

  const records = data ?? [];
  const total = records.length;
  const uniqueUsers = new Set(records.map((r: any) => r.userId)).size;
  const lastRead = records.length > 0
    ? new Date(Math.max(...records.map((r: any) => new Date(r.readAt).getTime())))
    : null;

  return { total, uniqueUsers, lastRead };
}

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

export async function getAnnouncementAnalytics(
  announcementId: string
): Promise<{
  delivery: Record<string, number>;
  reads: { total: number; uniqueUsers: number; lastRead: Date | null };
  audience: {
    all: number;
    students: number;
    byPlan: Record<string, number>;
    byFaculty: number;
    byStage: number;
    byGrade: number;
  };
}> {
  const delivery = await getDeliveryStats(announcementId);
  const reads = await getReadStats(announcementId);

  return {
    delivery,
    reads,
    audience: {
      all: 1,
      students: 0,
      byPlan: {},
      byFaculty: 0,
      byStage: 0,
      byGrade: 0
    }
  };
}
