// ===========================================================================
// MAGICLY — SPRINT 1 — Batch 1
// Support Tickets — Attachments endpoint
// GET /api/tickets/[id]/attachments, POST /api/tickets/[id]/attachments
// ===========================================================================

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { support_ticket_attachments, support_tickets } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createServiceClient } from '@/lib/supabase/admin';
import { hasPermission } from '@/lib/auth-roles';

// GET /api/tickets/[id]/attachments
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

    // Non-support staff can only see attachments on their own tickets
    if (!isSupportStaff && ticket.user_id !== userId) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    // Get attachments for this ticket
    const attachments = await db
      .select()
      .from(support_ticket_attachments)
      .where(eq(support_ticket_attachments.ticket_id, id))
      .orderBy(desc(support_ticket_attachments.created_at));

    return NextResponse.json({
      success: true,
      attachments,
    });
  } catch (error) {
    console.error('[tickets] GET attachments [id]', error);
    return NextResponse.json({ success: false, error: 'Failed to load attachments.' }, { status: 500 });
  }
}

// POST /api/tickets/[id]/attachments
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
    const isAgent = await hasPermission(service, user.id, user.email ?? null, 'support.manage');
    const isManager = await hasPermission(service, user.id, user.email ?? null, 'support.manage');
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

    // Support staff can add attachments to any ticket; regular users can only add to their own
    if (!isSupportStaff && ticket.user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    const body = await req.json() as {
      file_path: string;
      file_name: string;
      mime_type: string;
      file_size: number;
    };

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
    }

    const { file_path, file_name, mime_type, file_size } = body;

    if (!file_path || !file_name || !mime_type || typeof file_size !== 'number') {
      return NextResponse.json({ success: false, error: 'Invalid attachment data.' }, { status: 400 });
    }

    // Insert attachment
    const [attachment] = await db
      .insert(support_ticket_attachments)
      .values({
        ticket_id: id,
        user_id: user.id,
        uploaded_by: user.id,
        file_url: file_path,
        file_name,
        mime_type,
        size_bytes: file_size,
      })
      .returning();

    if (!attachment) {
      console.error('[tickets] POST attachment');
      return NextResponse.json({ success: false, error: 'Failed to upload attachment.' }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        attachment,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[tickets] POST attachments [id]', error);
    return NextResponse.json({ success: false, error: 'Failed to upload attachment.' }, { status: 500 });
  }
}
