// ===========================================================================
// MAGICLY — SPRINT 1 — Batch 1
// Support Tickets — Rating endpoint
// POST /api/tickets/[id]/rate
// ===========================================================================

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { support_tickets, support_ticket_ratings, support_ticket_events } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createServiceClient } from '@/lib/supabase/admin';
import { hasPermission } from '@/lib/auth-roles';

// POST /api/tickets/[id]/rate
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

    const body = await req.json() as {
      rating: number;
      comment?: string;
    };

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
    }

    const { rating, comment } = body;

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return NextResponse.json({ success: false, error: 'Rating must be between 1 and 5.' }, { status: 400 });
    }

    // Only the ticket creator can rate
    if (ticket.user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Only the ticket creator can rate.' }, { status: 403 });
    }

    // Insert rating
    const [ratingData] = await db
      .insert(support_ticket_ratings)
      .values({
        ticket_id: id,
        user_id: user.id,
        rating,
        comment: comment || null,
      })
      .returning();

    if (!ratingData) {
      console.error('[tickets] POST rate');
      return NextResponse.json({ success: false, error: 'Failed to submit rating.' }, { status: 500 });
      return NextResponse.json({ success: false, error: 'Failed to submit rating.' }, { status: 500 });
    }

    // Update ticket rating fields
    await db
      .update(support_tickets)
      .set({
        rating,
      })
      .where(eq(support_tickets.id, id));

    // Log event
    await db.insert(support_ticket_events).values({
      ticket_id: id,
      user_id: user.id,
      event_type: 'rating_submitted',
      metadata: { rating, comment: comment || null },
      created_at: new Date(),
    });

    return NextResponse.json({
      success: true,
      rating: ratingData,
    });
  } catch (error) {
    console.error('[tickets] POST rate', error);
    return NextResponse.json({ success: false, error: 'Failed to submit rating.' }, { status: 500 });
  }
}
