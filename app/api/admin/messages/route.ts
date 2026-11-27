// ===========================================================================
// MAGICLY — ADMIN-TO-USER DIRECT MESSAGING
// Protected: requires support.manage OR site.owner permission
// ===========================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { hasPermission } from '@/lib/auth-roles';
import { recordAuditLog } from '@/lib/admin/audit-log-record';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v: any) { return typeof v === 'string' && UUID_RE.test(v); }

// GET /api/admin/messages — List conversations for this user (as admin)
export async function GET() {
  try {
    const supabase = await createClient();
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

    // Get all users that this admin can message
    // For now, get all non-anonymous users with public profiles
    const { data: users, error } = await service
      .from('profiles')
      .select('id, display_name, public_user_code, email, avatar_url, is_anonymous')
      .eq('is_anonymous', false)
      .order('display_name', { ascending: true });

    if (error) {
      console.error('[admin/messages] GET users', error);
      return NextResponse.json({ success: false, error: 'Failed to load users.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      users: users ?? [],
    });
  } catch (error) {
    console.error('[admin/messages] GET', error);
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 });
  }
}

// POST /api/admin/messages — Send direct message to a student
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
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

    const body = await req.json() as {
      recipient_id: string;
      message: string;
      metadata?: Record<string, unknown>;
    };

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
    }

    const { recipient_id, message, metadata } = body;

    if (!recipient_id || typeof recipient_id !== 'string' || !isUuid(recipient_id)) {
      return NextResponse.json({ success: false, error: 'Invalid recipient id.' }, { status: 400 });
    }

    if (!message || typeof message !== 'string' || message.trim().length < 1) {
      return NextResponse.json({ success: false, error: 'Message body is required.' }, { status: 400 });
    }

    if (recipient_id === user.id) {
      return NextResponse.json({ success: false, error: 'Cannot message yourself.' }, { status: 400 });
    }

    // Get the recipient's public profile
    const { data: profile, error: profileError } = await service
      .from('profiles')
      .select('id, display_name, public_user_code, avatar_url')
      .eq('id', recipient_id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ success: false, error: 'Recipient not found.' }, { status: 404 });
    }

    // Create the direct message conversation
    // Note: This is a simplified direct messaging system.
    // In a full implementation, this would create a conversation with participants.
    const { data: conversation, error: convError } = await service
      .from('support_tickets')
      .insert({
        user_id: recipient_id,
        subject: `رسالة من الإدارة: ${message.substring(0, 50)}`,
        category: 'admin_message',
        priority: 'normal',
        description: `Admin-to-user direct message. Sender: ${user.id} (${user.email})`,
        status: 'open',
      })
      .select()
      .single();

    if (convError || !conversation) {
      console.error('[admin/messages] POST create conversation', convError);
      return NextResponse.json({ success: false, error: 'Failed to create conversation.' }, { status: 500 });
    }

    // Insert the message
    const { data: messageData, error: msgError } = await service
      .from('support_messages')
      .insert({
        ticket_id: conversation.id,
        user_id: user.id,
        author_role: 'admin',
        body: message.trim(),
      })
      .select()
      .single();

    if (msgError || !messageData) {
      console.error('[admin/messages] POST insert message', msgError);
      return NextResponse.json({ success: false, error: 'Failed to send message.' }, { status: 500 });
    }

    // Create audit log
    await recordAuditLog({
      actor: user.id,
      actor_email: user.email ?? null,
      action: 'admin_message.send',
      resource_type: 'admin_message',
      resource_id: conversation.id,
      details: { recipient_id, recipient_name: profile.display_name },
      result: 'PASS',
    });

    return NextResponse.json({
      success: true,
      message: message,
      conversation: { id: conversation.id, subject: conversation.subject, created_at: conversation.created_at },
    }, { status: 201 });
  } catch (error) {
    console.error('[admin/messages] POST', error);
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 });
  }
}
