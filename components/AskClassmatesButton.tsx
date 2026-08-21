'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function AskClassmatesButton({
  subject,
  lessonTitle,
  question,
}: {
  subject: string;
  lessonTitle?: string;
  question: string;
}) {
  const supabase = createClient();
  const [posted, setPosted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const userName = (user?.user_metadata?.full_name as string) || 'زائر';

    const { error } = await supabase.from('community_questions').insert({
      user_id: user?.id ?? null,
      user_name: userName,
      subject,
      lesson_title: lessonTitle ?? null,
      question,
    });

    if (!error) setPosted(true);
    setLoading(false);
  };

  if (posted) {
    return (
      <p className="notice notice-ok mt-2 text-xs">
        <span aria-hidden="true">✓</span>
        <span>اتبعت سؤالك للمجتمع، هتلاقي رد لما حد يجاوبك.</span>
      </p>
    );
  }

  return (
    <button
      onClick={handleAsk}
      disabled={loading}
      className="btn btn-quiet text-xs px-4 py-2 mt-2"
    >
      {loading ? 'جاري الإرسال...' : 'اسأل زمايلك بدل كده'}
    </button>
  );
}
