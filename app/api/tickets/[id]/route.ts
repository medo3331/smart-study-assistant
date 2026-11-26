// ===========================================================================
// MAGICLY — SPRINT 1 — Batch 1
// Support Tickets — Resource endpoints
// GET, PATCH, DELETE /api/tickets/[id]
// ===========================================================================

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { support_tickets, support_ticket_assignments, support_ticket_events, support_ticket_attachments } from '@/lib/db/schema';
import { eq, or, desc, sql, and } from 'drizzle-orm';
import { createServiceClient } from '@/lib/supabase/admin';
import { hasPermission } from '@/lib/auth-roles';

// GET /api/tickets/[id]
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid ticket id.' }, { status: 400 });
    }

    const service = await createServiceClient();
    const user = await service.auth.getUser();

    if (!user?.data?.user) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const userId = user.data.user.id;
    const userEmail = user.data.user.email ?? null;
    const isOwner = await hasPermission(service, userId, userEmail, 'site.owner');
    const isAgent = await hasPermission(service, userId, userEmail, 'support.manage');
    const isManager = await hasPermission(service, userId, userEmail, 'support.manage');
    const isAdmin = await hasPermission(service, userId, userEmail, 'support.manage');

    const isSupportStaff = isAdmin || isAgent || isManager || isOwner;

    // Build where conditions: only id required; non-staff gets user_id filter too
    const whereConditions = [eq(support_tickets.id, id)];
    if (!isSupportStaff) {
      whereConditions.push(eq(support_tickets.user_id, userId));
    }
    const [ticket] = await db.select()
      .from(support_tickets)
      .where(and(...whereConditions))
      .limit(1);

    if (!ticket) {
      return NextResponse.json({ success: false, error: 'Ticket not found.' }, { status: 404 });
    }

    // Non-owner users also need to see if they're assigned or the ticket is open
    if (!isSupportStaff && ticket.user_id !== userId && ticket.status !== 'open') {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    // Get associated attachments count
    const [{ count: messageCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(support_ticket_attachments)
      .where(eq(support_ticket_attachments.ticket_id, id));

    return NextResponse.json({
      success: true,
      ticket,
      message_count: messageCount,
    });
  } catch (error) {
    console.error('[tickets] GET [id]', error);
    return NextResponse.json({ success: false, error: 'Failed to load ticket.' }, { status: 500 });
  }
}

// PATCH /api/tickets/[id]
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid ticket id.' }, { status: 400 });
    }

    const supabase = await createServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const service = await createServiceClient();
    const isAgent = await hasPermission(service, user.id, user.email ?? null, 'support.manage');
    const isManager = await hasPermission(service, user.id, user.email ?? null, 'support.manage');
    const isOwner = await hasPermission(service, user.id, user.email ?? null, 'site.owner');

    // Determine access level
    const isSupportStaff = isAgent || isManager || isOwner;

    // Check ticket exists
    const [existing] = await db.select()
      .from(support_tickets)
      .where(eq(support_tickets.id, id));

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Ticket not found.' }, { status: 404 });
    }

    // Non-support staff can only update their own tickets
    if (!isSupportStaff && existing.user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    const body = await req.json() as {
      subject?: string;
      category?: string;
      priority?: string;
      status?: string;
      assigned_to?: string;
      closed_reason?: string;
      rating?: number;
    };

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    let hasUpdates = false;

    // Allowed fields to update for non-admin users
    const allowedNonAdminFields = ['description', 'status', 'priority'];
    const allowedAdminFields = ['subject', 'category', 'priority', 'status', 'assigned_to', 'closed_reason', 'rating'];

    // For support staff, allow all fields
    // For regular users, only allow limited fields
    const canUpdateAll = isSupportStaff;

    if (canUpdateAll || allowedNonAdminFields.includes('subject') && body.subject !== undefined) {
      if (typeof body.subject === 'string' && body.subject.trim().length >= 3) {
        updates.subject = body.subject.trim();
        hasUpdates = true;
      }
    }

    if (canUpdateAll || allowedNonAdminFields.includes('category') && body.category !== undefined) {
      if (typeof body.category === 'string') {
        updates.category = body.category;
        hasUpdates = true;
      }
    }

    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    if (canUpdateAll || allowedNonAdminFields.includes('priority')) {
      if (typeof body.priority === 'string' && validPriorities.includes(body.priority)) {
        updates.priority = body.priority;
        hasUpdates = true;
      }
    }

    const validStatuses = ['open', 'pending', 'in_progress', 'waiting', 'resolved', 'closed'];
    if (canUpdateAll || allowedNonAdminFields.includes('status')) {
      if (typeof body.status === 'string' && validStatuses.includes(body.status)) {
        updates.status = body.status;
        hasUpdates = true;
      }
    }

    if (canUpdateAll && body.rating !== undefined) {
      if (typeof body.rating === 'number' && body.rating >= 1 && body.rating <= 5) {
        updates.rating = body.rating;
        hasUpdates = true;
      }
    }

    if (!hasUpdates) {
      // Return current state
      return NextResponse.json({ success: true, ticket: existing });
    }

    // Update ticket
    const [updated] = await db
      .update(support_tickets)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(support_tickets.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Failed to update ticket.' }, { status: 500 });
    }

    // Log event
    if (isSupportStaff) {
      await db.insert(support_ticket_events).values({
        ticket_id: id,
        user_id: user.id,
        event_type: `ticket_updated_${Object.keys(updates).join('_')}`,
        metadata: { changes: updates },
        created_at: new Date(),
      });
    }

    return NextResponse.json({ success: true, ticket: updated });
  } catch (error) {
    console.error('[tickets] PATCH [id]', error);
    return NextResponse.json({ success: false, error: 'Failed to update ticket.' }, { status: 500 });
  }
}

// DELETE /api/tickets/[id]
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid ticket id.' }, { status: 400 });
    }

    const supabase = await createServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const service = await createServiceClient();
    const isAgent = await hasPermission(service, user.id, user.email ?? null, 'support.manage');
    const isManager = await hasPermission(service, user.id, user.email ?? null, 'support.manage');
    const isOwner = await hasPermission(service, user.id, user.email ?? null, 'site.owner');

    // Determine access level
    const isSupportStaff = isAgent || isManager || isOwner;

    // Check ticket exists
    const [existing] = await db
      .select()
      .from(support_tickets)
      .where(eq(support_tickets.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Ticket not found.' }, { status: 404 });
    }

    // Support staff can delete any ticket; regular users can only delete their own
    if (!isSupportStaff && existing.user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    const [deleted] = await db
      .delete(support_tickets)
      .where(eq(support_tickets.id, id))
      .returning();

    if (!deleted) {
      console.error('[tickets] DELETE [id]: ticket not found');
      return NextResponse.json({ success: false, error: 'Ticket not found.' }, { status: 404 });
    }

    // Log event
    await db.insert(support_ticket_events).values({
      ticket_id: id,
      user_id: user.id,
      event_type: 'ticket_deleted',
      metadata: { deleted_by: user.id },
      created_at: new Date(),
    });

    return NextResponse.json({ success: true, message: 'Ticket deleted.' });
  } catch (error) {
    console.error('[tickets] DELETE [id]', error);
    return NextResponse.json({ success: false, error: 'Failed to delete ticket.' }, { status: 500 });
  }
}
