'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const DEFAULT_DURATION = 25 * 60;

interface SessionState {
  is_running: boolean;
  duration_seconds: number;
  started_at: string | null;
}

export function StudyRoom({ subject }: { subject: string }) {
  const supabase = createClient();
  const [session, setSession] = useState<SessionState>({
    is_running: false,
    duration_seconds: DEFAULT_DURATION,
    started_at: null,
  });
  const [remaining, setRemaining] = useState(DEFAULT_DURATION);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const { data } = await supabase
        .from('study_sessions')
        .select('*')
        .eq('subject', subject)
        .maybeSingle();
      if (mounted && data) setSession(data);
    };
    loadSession();

    const channel = supabase
      .channel(`study-session-${subject}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'study_sessions', filter: `subject=eq.${subject}` },
        (payload) => {
          if (payload.new) setSession(payload.new as SessionState);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [subject]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (session.is_running && session.started_at) {
      const tick = () => {
        const elapsed = Math.floor((Date.now() - new Date(session.started_at!).getTime()) / 1000);
        const left = Math.max(session.duration_seconds - elapsed, 0);
        setRemaining(left);
        if (left === 0 && intervalRef.current) clearInterval(intervalRef.current);
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
    } else {
      setRemaining(session.duration_seconds);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session]);

  useEffect(() => {
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    const setupPresence = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const userName = (user?.user_metadata?.full_name as string) || 'زائر';

      const presenceChannel = supabase.channel(`presence-${subject}`, {
        config: { presence: { key: user?.id || crypto.randomUUID() } },
      });

      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel.presenceState();
          const names = Object.values(state).flat().map((p: any) => p.user_name);
          setOnlineUsers(names);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await presenceChannel.track({ user_name: userName });
        });

      channelRef = presenceChannel;
    };
    setupPresence();

    return () => {
      if (channelRef) supabase.removeChannel(channelRef);
    };
  }, [subject]);

  const startTimer = async () => {
    await supabase.from('study_sessions').upsert({
      subject,
      is_running: true,
      duration_seconds: DEFAULT_DURATION,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  };

  const pauseTimer = async () => {
    await supabase
      .from('study_sessions')
      .update({ is_running: false, duration_seconds: remaining, updated_at: new Date().toISOString() })
      .eq('subject', subject);
  };

  const resetTimer = async () => {
    await supabase
      .from('study_sessions')
      .update({
        is_running: false,
        duration_seconds: DEFAULT_DURATION,
        started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('subject', subject);
  };

  const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
  const seconds = (remaining % 60).toString().padStart(2, '0');

  return (
    // الورقة بتبقى "شغّالة" بس وقت ما الجلسة ماشية — الهامش الأحمر هو مؤشر الحالة
    <div dir="rtl" className={`sheet-card p-5 ${session.is_running ? 'sheet-card-live' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="eyebrow eyebrow-flush mb-1.5">غرفة مذاكرة</p>
          <h3 className="h3 truncate">{subject}</h3>
        </div>
        <span className="tag tag-quiet shrink-0 tnum">{onlineUsers.length} متصل دلوقتي</span>
      </div>

      <div className="bg-paper border border-rule rounded-[var(--r-sm)] py-6 text-center">
        {/* العدّاد فيه نقطتين، فمحتاج ltr-num عشان RTL ما يقلبهوش */}
        <p className="ltr-num tnum font-display font-extrabold text-5xl leading-none text-ink tracking-tight">
          {minutes}:{seconds}
        </p>
        <p className="tag justify-center mt-3">
          {session.is_running ? 'شغال دلوقتي — ركز معانا' : 'الجلسة متوقفة'}
        </p>
      </div>

      <div className="flex gap-2 justify-center mt-4">
        {!session.is_running ? (
          <button onClick={startTimer} className="btn btn-marker text-sm px-5 py-2.5">
            <span aria-hidden="true">▶</span> ابدأ الجلسة
          </button>
        ) : (
          <button onClick={pauseTimer} className="btn btn-quiet text-sm px-5 py-2.5">
            <span aria-hidden="true">⏸</span> إيقاف مؤقت
          </button>
        )}
        <button onClick={resetTimer} className="btn btn-quiet text-sm px-5 py-2.5 text-ink-soft">
          إعادة تعيين
        </button>
      </div>

      {onlineUsers.length > 0 && (
        <p className="mono text-ink-soft text-center mt-4">معاك دلوقتي: {onlineUsers.join('، ')}</p>
      )}
    </div>
  );
}
