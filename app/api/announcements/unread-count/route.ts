import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });

    const now = new Date().toISOString();

    // Announcements within active window:
    // - published
    // - publish_at is null OR publish_at <= now (not scheduled in future)
    // - expires_at is null OR expires_at > now (not expired)
    // Use separate .eq/.gte/.lte for AND logic; null-safe via application-side filter
    const { data: anns, error: aErr } = await supabase
      .from('announcements')
      .select('id')
      .eq('status', 'published')
      .gte('publish_at', now)
      .lte('expires_at', now);

    if (aErr) {
      console.error('[unread-count]', aErr.message);
      return NextResponse.json({ success: false, error: 'Failed to load announcements.' }, { status: 500 });
    }

    // For null-date announcements (null publish_at or expires_at), use OR rule
    // to include them (they are active by default)
    const { data: nullDateAnnss, error: nullErr } = await supabase
      .from('announcements')
      .select('id')
      .eq('status', 'published')
      .or(`publish_at.is.null,expires_at.is.null`);

    const allAnnIds = new Set<string>();
    for (const a of (anns ?? [])) allAnnIds.add(a.id);
    for (const a of (nullDateAnnss ?? [])) allAnnIds.add(a.id);

    const ids = Array.from(allAnnIds);

    if (ids.length === 0) return NextResponse.json({ success: true, count: 0 });

    const { data: reads, error: rErr } = await supabase
      .from('announcement_reads')
      .select('announcement_id')
      .eq('user_id', user.id)
      .in('announcement_id', ids);

    if (rErr) {
      console.error('[unread-count]', rErr.message);
      return NextResponse.json({ success: false, error: 'Failed to load read receipts.' }, { status: 500 });
    }

    const readSet = new Set((reads ?? []).map((r: any) => r.announcement_id));
    const count = ids.filter((id: string) => !readSet.has(id)).length;
    return NextResponse.json({ success: true, count });
  } catch (e) {
    console.error('[unread-count]', e);
    return NextResponse.json({ success: false, error: 'Unexpected error.' }, { status: 500 });
  }
}
