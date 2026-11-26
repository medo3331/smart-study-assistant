// ===========================================================================
// MAGICLY — SPRINT 1 — Batch 1
// Support Tickets — Audit events endpoint
// GET /api/tickets/[id]/events
// ===========================================================================

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { support_tickets, support_ticket_events } from '@/lib/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { createServiceClient } from '@/lib/supabase/admin';
import { hasPermission } from '@/lib/auth-roles';

// GET /api/tickets/[id]/events
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid ticket id.' }, { status: 400 });
    }

    const service = createServiceClient();
    const { data: { user }, error: authError } = await service.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const userId = user.id;
    const userEmail = user.email ?? null;
    const isAgent = await hasPermission(service, userId, userEmail, 'support.manage');
    const isManager = await hasPermission(service, userId, userEmail, 'support.manage');
    const isOwner = await hasPermission(service, userId, userEmail, 'site.owner');
    const isAdmin = await hasPermission(service, userId, userEmail, 'support.manage');
    const isSupportStaff = isAdmin || isAgent || isManager || isOwner;

    const [ticket] = await db
      .select()
      .from(support_tickets)
      .where(eq(support_tickets.id, id))
      .limit(1);

    if (!ticket) {
      return NextResponse.json({ success: false, error: 'Ticket not found.' }, { status: 404 });
    }

    // Non-support staff can only see events on their own tickets
    if (!isSupportStaff && ticket.user_id !== userId) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    // Get events for this ticket
    const events = await db
      .select()
      .from(support_ticket_events)
      .where(eq(support_ticket_events.ticket_id, id))
      .orderBy(desc(support_ticket_events.created_at))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(support_ticket_events)
      .where(eq(support_ticket_events.ticket_id, id));

    // Enrich events with actor info if support staff
    let enrichedEvents = events;
    if (isSupportStaff) {
      // Note: In a real implementation, you'd fetch actor details here.
      // For now, we just return the events as-is.
      enrichedEvents = events;
    }

    return NextResponse.json({
      success: true,
      events: enrichedEvents,
      pagination: { page, limit, total: count || 0 },
    });
  } catch (error) {
    console.error('[tickets] GET events [id]', error);
    return NextResponse.json({ success: false, error: 'Failed to load events.' }, { status: 500 });
  }
}
