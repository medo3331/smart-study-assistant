// ===========================================================================
// MAGICLY — SPRINT 1 — Batch 1
// Support Tickets — Messages endpoint
// GET /api/tickets/[id]/messages, POST /api/tickets/[id]/messages
// ===========================================================================

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { support_tickets, support_ticket_assignments, support_messages, support_ticket_attachments, support_ticket_events } from '@/lib/db/schema';
import { eq, desc, and, or, sql } from 'drizzle-orm';
import { createServiceClient } from '@/lib/supabase/admin';
import { hasPermission } from '@/lib/auth-roles';

// GET /api/tickets/[id]/messages
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
    const isOwner = await hasPermission(service, userId, userEmail, 'site.owner');
    const isAgent = await hasPermission(service, userId, userEmail, 'support.manage');
    const isManager = await hasPermission(service, userId, userEmail, 'support.manage');
    const isAdmin = await hasPermission(service, userId, userEmail, 'support.manage');

    const isSupportStaff = isAdmin || isAgent || isManager || isOwner;

    // Check ticket exists
    const [ticket] = await db
      .select()
      .from(support_tickets)
      .where(eq(support_tickets.id, id))
      .limit(1);

    if (!ticket) {
      return NextResponse.json({ success: false, error: 'Ticket not found.' }, { status: 404 });
    }

    // Non-support staff can only see messages on their own tickets
    if (!isSupportStaff && ticket.user_id !== userId) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    // Get messages for this ticket, ordered by creation time
    const messages = await db
      .select()
      .from(support_messages)
      .where(eq(support_messages.ticket_id, id))
      .orderBy(desc(support_messages.created_at));

    // Get attachment info for this ticket if needed
    const [{ count: attachmentCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(support_ticket_attachments)
      .where(eq(support_ticket_attachments.ticket_id, id));

    // If not support staff, also get the assignments (for showing assigned agent info to the user)
    let assignments = null;
    if (isSupportStaff) {
      assignments = await db
        .select()
        .from(support_ticket_assignments)
        .where(eq(support_ticket_assignments.ticket_id, id));
    }

    return NextResponse.json({
      success: true,
      ticket,
      messages,
      attachments_count: attachmentCount,
      assignments,
    });
  } catch (error) {
    console.error('[tickets] GET messages [id]', error);
    return NextResponse.json({ success: false, error: 'Failed to load messages.' }, { status: 500 });
  }
}

// POST /api/tickets/[id]/messages
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const service = createServiceClient();
    const isAgent = await hasPermission(service, user.id, user.email ?? null, 'support.reply');
    const isManager = await hasPermission(service, user.id, user.email ?? null, 'support.assign');
    const isOwner = await hasPermission(service, user.id, user.email ?? null, 'site.owner');
    const isSupportStaff = isAgent || isManager || isOwner;

    // Check ticket exists
    const [ticket] = await db
      .select()
      .from(support_tickets)
      .where(eq(support_tickets.id, id))
      .limit(1);

    if (!ticket) {
      return NextResponse.json({ success: false, error: 'Ticket not found.' }, { status: 404 });
    }

    // Support staff can reply to any ticket; regular users can only reply to their own
    if (!isSupportStaff && ticket.user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    const body = await req.json() as {
      body: string;
      is_internal?: boolean;
      author_role?: string;
      attachments?: { file_path: string; file_name: string; mime_type: string; file_size: number }[];
    };

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
    }

    const { body: messageBody, is_internal, author_role, attachments } = body;

    if (!messageBody || typeof messageBody !== 'string' || messageBody.trim().length < 1) {
      return NextResponse.json({ success: false, error: 'Message body is required.' }, { status: 400 });
    }

    // Determine author role
    const authorRole = author_role || 'user';
    const allowedRoles = ['user', 'admin', 'agent'];
    if (!allowedRoles.includes(authorRole)) {
      return NextResponse.json({ success: false, error: 'Invalid author role.' }, { status: 400 });
    }

    // Insert message
    const [message] = await db
      .insert(support_messages)
      .values({
        ticket_id: id,
        user_id: user.id,
        author_role: authorRole,
        body: messageBody.trim(),
      })
      .returning();

    if (!message) {
      console.error('[tickets] POST message');
      return NextResponse.json({ success: false, error: 'Failed to send message.' }, { status: 500 });
      return NextResponse.json({ success: false, error: 'Failed to send message.' }, { status: 500 });
    }

    // Create event for agent replies, or internal notes
    const action = is_internal
      ? 'internal_note'
      : (authorRole === 'agent' ? 'agent_reply' : 'student_reply');

    if (isSupportStaff || !is_internal) {
      await db.insert(support_ticket_events).values({
        ticket_id: id,
        user_id: user.id,
        event_type: action,
        metadata: { body: messageBody, is_internal: !!is_internal },
        created_at: new Date(),
      });
    }

    // Attach files if provided
    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        await db.insert(support_ticket_attachments).values({
          ticket_id: id,
          user_id: user.id,
          file_url: att.file_path,
          file_name: att.file_name,
          mime_type: att.mime_type,
          size_bytes: att.file_size,
          uploaded_by: user.id,
          created_at: new Date(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: {
        ...message,
        author_role: authorRole,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[tickets] POST messages [id]', error);
    return NextResponse.json({ success: false, error: 'Failed to send message.' }, { status: 500 });
  }
}
