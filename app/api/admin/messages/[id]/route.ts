// ===========================================================================
// MAGICLY — Admin-to-User Direct Messaging — Conversation endpoint
// ===========================================================================

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { support_messages, support_tickets } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { createServiceClient } from '@/lib/supabase/admin';
import { hasPermission } from '@/lib/auth-roles';

// GET /api/admin/messages/[id] — Get conversation by ticket id
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

    // Get the ticket (this is a support_tickets row used as a conversation)
    const [ticket] = await db
      .select()
      .from(support_tickets)
      .where(eq(support_tickets.id, id))
      .limit(1);

    if (!ticket) {
      return NextResponse.json({ success: false, error: 'Conversation not found.' }, { status: 404 });
    }

    // Non-support staff can only see their own tickets
    if (ticket.user_id !== user.id && !isOwner) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      conversation: {
        id: ticket.id,
        subject: ticket.subject || 'رسالة إدارة',
        status: ticket.status,
        created_at: ticket.created_at,
        category: ticket.category,
      },
      message_count: (
        await db.select({ count: sql<number>`count(*)` })
          .from(support_messages)
          .where(eq(support_messages.ticket_id, id))
          .limit(1)
      )[0]?.count ?? 0,
    });
  } catch (error) {
    console.error('[admin/messages/[id]] GET', error);
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 });
  }
}
