import { NextResponse } from 'next/server';
import { checkRateLimit, clampText } from '@/lib/api-guard';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';

const MAX_NAME = 60;
const MAX_COMMENT = 700;

export async function GET() {
  try {
    // Read through the public Supabase client so RLS guarantees that only
    // explicitly moderated testimonials can ever be returned.
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('testimonials')
      .select('id, display_name, rating, comment, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(6);

    if (error) {
      console.error('[testimonials] public list failed:', error.message);
      return NextResponse.json({ reviews: [] }, { status: 503 });
    }
    return NextResponse.json({ reviews: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[testimonials] public list error:', error);
    return NextResponse.json({ reviews: [] }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const forwarded = request.headers.get('x-forwarded-for') ?? '';
    const ip = forwarded.split(',')[0]?.trim() || 'unknown';
    const limited = await checkRateLimit(`testimonial:${user?.id ?? ip}`, user ? 5 : 3, 60_000, 'success');
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'البيانات غير صالحة.' }, { status: 400 });
    }

    const rating = body.rating;
    const comment = clampText(body.comment, MAX_COMMENT).trim();
    const displayName = clampText(body.displayName, MAX_NAME).trim() || 'طالب ماجيكلي';
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ success: false, error: 'اختار تقييمًا من 1 إلى 5.' }, { status: 400 });
    }
    if (comment.length < 8) {
      return NextResponse.json({ success: false, error: 'اكتب رأيًا من 8 أحرف على الأقل.' }, { status: 400 });
    }

    const db = createServiceClient();
    const { error } = await db.from('testimonials').insert({
      user_id: user?.id ?? null,
      display_name: displayName,
      rating,
      comment,
      is_published: false,
    });

    if (error) {
      console.error('[testimonials] submission failed:', error.message);
      return NextResponse.json({ success: false, error: 'تعذر حفظ تقييمك. حاول تاني.' }, { status: 503 });
    }
    return NextResponse.json({ success: true, pending: true }, { status: 201 });
  } catch (error) {
    console.error('[testimonials] submission error:', error);
    return NextResponse.json({ success: false, error: 'حصل خطأ غير متوقع. حاول تاني.' }, { status: 500 });
  }
}
