// ===========================================================================
// MAGICLY — Admin-to-User Direct Messaging — Messages endpoint
// ===========================================================================

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { support_messages, support_ticket_events, support_tickets } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createServiceClient } from '@/lib/supabase/admin';
import { hasPermission } from '@/lib/auth-roles';
import { recordAuditLog } from '@/lib/admin/audit-log-record';

// GET /api/admin/messages/[id]/messages — Get message history
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid conversation id.' }, { status: 400 });
    }

    const supabase = await createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const service = createServiceClient();
    const isOwner = await hasPermission(service, user.id, user.email ?? null, 'site.owner');
    const isAdmin = await hasPermission(service, user.id, user.email ?? null, 'support.manage');
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });
    }

    const [ticket] = await db
      .select()
      .from(support_tickets)
      .where(eq(support_tickets.id, id))
      .limit(1);

    if (!ticket) {
      return NextResponse.json({ success: false, error: 'Conversation not found.' }, { status: 404 });
    }

    if (ticket.user_id !== user.id && !isOwner) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    const messages = await db
      .select()
      .from(support_messages)
      .where(eq(support_messages.ticket_id, id))
      .orderBy(desc(support_messages.created_at));

    return NextResponse.json({
      success: true,
      messages: messages ?? [],
    });
  } catch (error) {
    console.error('[admin/messages/[id]/messages] GET', error);
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 });
  }
}

// POST /api/admin/messages/[id]/messages — Send message
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid conversation id.' }, { status: 400 });
    }

    const supabase = await createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const service = createServiceClient();
    const isOwner = await hasPermission(service, user.id, user.email ?? null, 'site.owner');
    const isAdmin = await hasPermission(service, user.id, user.email ?? null, 'support.manage');
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });
    }

    // Check ticket exists
    const [ticket] = await db
      .select()
      .from(support_tickets)
      .where(eq(support_tickets.id, id))
      .limit(1);

    if (!ticket) {
      return NextResponse.json({ success: false, error: 'Conversation not found.' }, { status: 404 });
    }

    if (ticket.user_id !== user.id && !isOwner) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    const body = await req.json() as { body: string; attachments?: unknown[] };

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
    }

    const { body: messageBody, attachments } = body;

    if (!messageBody || typeof messageBody !== 'string' || messageBody.trim().length < 1) {
      return NextResponse.json({ success: false, error: 'Message body is required.' }, { status: 400 });
    }

    const messageBodyTrimmed = messageBody.trim();

    // Insert message with admin role
    const [message] = await db
      .insert(support_messages)
      .values({
        ticket_id: id,
        user_id: user.id,
        author_role: 'admin',
        body: messageBodyTrimmed,
      })
      .returning();

    if (!message) {
      return NextResponse.json({ success: false, error: 'Failed to send message.' }, { status: 500 });
    }

    // Create audit event
    await db.insert(support_ticket_events).values({
      ticket_id: id,
      user_id: user.id,
      event_type: 'admin_reply',
      metadata: { body: messageBodyTrimmed },
      created_at: new Date(),
    });

    // Record audit log
    await recordAuditLog({
      actor: user.id,
      actor_email: user.email ?? null,
      action: 'admin_message.reply',
      resource_type: 'admin_message',
      resource_id: id,
      details: { body: messageBodyTrimmed.substring(0, 200) },
      result: 'PASS',
    });

    // Notify the student
    try {
      await service.from('notifications').insert({
        recipient_id: ticket.user_id,
        type: 'admin_message',
        title: 'رسالة من الإدارة',
        body: `حصل إرسال لك من الإدارة: ${messageBodyTrimmed.substring(0, 100)}${messageBodyTrimmed.length > 100 ? '...' : ''}`,
        link_url: `/inbox`,
      });
    } catch (notificationError) {
      console.error('[admin/messages] POST notification', notificationError);
    }

    return NextResponse.json({
      success: true,
      message: {
        ...message,
        author_role: 'admin',
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[admin/messages/[id]/messages] POST', error);
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 });
  }
}
