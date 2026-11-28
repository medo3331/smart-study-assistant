// ===========================================================================
// MAGICLY — SPRINT 1
// Support Tickets — Collection endpoints (GET /api/tickets, POST /api/tickets)
// Supabase Native — No Drizzle ORM.
// ===========================================================================

import { NextResponse } from 'next/server';
import { hasPermission } from '@/lib/auth-roles';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';

// Types
interface TicketFilter {
  status?: string;
  priority?: string;
  category?: string;
  assigned_to?: string;
  search?: string;
}

const SUPPORT_CATEGORIES = ['login', 'account', 'payment', 'bug', 'content', 'performance', 'other'];
const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

// GET /api/tickets
export async function GET(req: Request) {
  try {
    // Authenticated server client — RLS enforces ownership for regular users
    const serverClient = await createClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    // Admin/authorized permissions check — use service client after authorization
    const service = createServiceClient();
    const isAdmin = await hasPermission(service, user.id, user.email ?? null, 'support.view');
    const isAgent = await hasPermission(service, user.id, user.email ?? null, 'support.reply');
    const isManager = await hasPermission(service, user.id, user.email ?? null, 'support.assign');
    const isOwner = await hasPermission(service, user.id, user.email ?? null, 'site.owner');
    const isSupportStaff = isAdmin || isAgent || isManager || isOwner;

    // Parse query params
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const priority = url.searchParams.get('priority');
    const category = url.searchParams.get('category');
    const assignedTo = url.searchParams.get('assigned_to');
    const search = url.searchParams.get('search');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);

    if (!isSupportStaff) {
      // Student: RLS restricts to own tickets — authenticated server client with RLS
      const { data: tickets, error: fetchError } = await serverClient
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (fetchError) {
        console.error('[tickets] GET', fetchError);
        return NextResponse.json({ success: false, error: 'Failed to load tickets.' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        tickets: tickets ?? [],
        pagination: { page, limit, total: (tickets?.length || 0) }
      });
    }

    // Support staff: service client after authorization (RLS bypassed per explicit role check)
    const params: { [key: string]: string[] } = {};
    if (status) {
      if (!SUPPORT_CATEGORIES.includes(status)) {
        return NextResponse.json({ success: false, error: 'Invalid status.' }, { status: 400 });
      }
      params.status = ['eq', status];
    }
    if (priority) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return NextResponse.json({ success: false, error: 'Invalid priority.' }, { status: 400 });
      }
      params.priority = ['eq', priority];
    }
    if (category) {
      if (!SUPPORT_CATEGORIES.includes(category)) {
        return NextResponse.json({ success: false, error: 'Invalid category.' }, { status: 400 });
      }
      params.category = ['eq', category];
    }
    if (assignedTo) {
      params.assigned_to = ['eq', assignedTo];
    }
    if (search) {
      params.subject = ['ilike', `%${search}%`];
      params.user_id = ['eq', search];
      params.priority = ['ilike', `%${search}%`];
      params.category = ['ilike', `%${search}%`];
    }

    let query = service
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (Object.keys(params).length > 0) {
    query = query
      .filter("status", "eq", params.status?.[1] ?? "")
      .filter("priority", "eq", params.priority?.[1] ?? "")
      .filter("category", "eq", params.category?.[1] ?? "")
      .filter("assigned_to", "eq", params.assignedTo ?? "");
    }

    const { data: tickets, error: fetchError } = await query;

    if (fetchError) {
      console.error('[tickets] GET', fetchError);
      return NextResponse.json({ success: false, error: 'Failed to load tickets.' }, { status: 500 });
    }

    // Count total for pagination metadata
    let total = tickets?.length || 0;
    if (search && !status && !priority && !category && !assignedTo) {
      const { count } = await service
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .or(`subject.ilike.${search},user_id.eq.${search},priority.ilike.${search},category.ilike.${search}`);
      total = count || 0;
    }

    return NextResponse.json({
      success: true,
      tickets: tickets ?? [],
      pagination: { page, limit, total }
    });
  } catch (error) {
    console.error('[tickets] GET', error);
    return NextResponse.json({ success: false, error: 'Failed to load tickets.' }, { status: 500 });
  }
}

// POST /api/tickets
export async function POST(req: Request) {
  try {
    // Authenticated server client — RLS enforces that user_id is from verified auth
    const serverClient = await createClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const body = await req.json() as {
      subject: string;
      category?: string;
      priority?: string;
      description: string;
      attachments?: { file_path: string; file_name: string; mime_type: string; file_size: number }[];
    };

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
    }

    const { subject, category, priority, description } = body;

    if (!subject || typeof subject !== 'string' || subject.trim().length < 3) {
      return NextResponse.json({ success: false, error: 'Subject must be at least 3 characters.' }, { status: 400 });
    }
    if (!category || typeof category !== 'string' || !SUPPORT_CATEGORIES.includes(category)) {
      return NextResponse.json({ success: false, error: 'Category must be one of: login, account, payment, bug, content, performance, other.' }, { status: 400 });
    }
    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return NextResponse.json({ success: false, error: 'Description must be at least 10 characters.' }, { status: 400 });
    }

    const ticketPriority = priority && VALID_PRIORITIES.includes(priority) ? priority : 'normal';

    // Insert using authenticated server client — RLS enforces user_id from verified auth
    const { data: ticket, error: insertError } = await serverClient
      .from('support_tickets')
      .insert({
        user_id: user.id,
        subject: subject.trim(),
        category,
        priority: ticketPriority,
        description: description.trim(),
        status: 'open',
      })
      .select()
      .single();

    if (insertError) {
      console.error('[tickets] POST insert', insertError);
      return NextResponse.json({ success: false, error: 'Failed to create ticket.' }, { status: 500 });
    }

    // Create audit event using authenticated server client
    await serverClient.from('support_ticket_events').insert({
      ticket_id: ticket.id,
      actor_id: user.id,
      action: 'ticket_created',
      details: { subject, category, priority: ticketPriority },
    });

    return NextResponse.json({
      success: true,
      ticket,
    }, { status: 201 });
  } catch (error) {
    console.error('[tickets] POST', error);
    return NextResponse.json({ success: false, error: 'Failed to create ticket.' }, { status: 500 });
  }
}