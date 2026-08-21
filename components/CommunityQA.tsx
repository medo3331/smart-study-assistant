'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Question {
  id: string;
  user_name: string;
  subject: string;
  lesson_title: string | null;
  question: string;
  created_at: string;
}
interface Answer {
  id: string;
  question_id: string;
  user_name: string;
  answer: string;
  created_at: string;
}

export function CommunityQA({ subjects }: { subjects: string[] }) {
  const supabase = createClient();
  const [activeSubject, setActiveSubject] = useState(subjects[0]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer[]>>({});
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuestions();
  }, [activeSubject]);

  const loadQuestions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('community_questions')
      .select('*')
      .eq('subject', activeSubject)
      .order('created_at', { ascending: false });
    setQuestions(data || []);

    if (data && data.length > 0) {
      const ids = data.map((q) => q.id);
      const { data: answersData } = await supabase
        .from('community_answers')
        .select('*')
        .in('question_id', ids)
        .order('created_at', { ascending: true });

      const grouped: Record<string, Answer[]> = {};
      (answersData || []).forEach((a) => {
        grouped[a.question_id] = grouped[a.question_id] || [];
        grouped[a.question_id].push(a);
      });
      setAnswers(grouped);
    }
    setLoading(false);
  };

  const submitAnswer = async (questionId: string) => {
    const text = answerDraft[questionId]?.trim();
    if (!text) return;

    const { data: { user } } = await supabase.auth.getUser();
    const userName = (user?.user_metadata?.full_name as string) || 'زائر';

    await supabase.from('community_answers').insert({
      question_id: questionId,
      user_id: user?.id ?? null,
      user_name: userName,
      answer: text,
    });

    setAnswerDraft((prev) => ({ ...prev, [questionId]: '' }));
    loadQuestions();
  };

  return (
    <div dir="rtl" className="space-y-4">
      <div>
        <p className="eyebrow eyebrow-flush mb-2.5">أسئلة الزمايل</p>
        {/* المادة المختارة بتتعلّم بالحبر مش بالفسفوري — الفسفوري للإجراء بس */}
        <div className="flex gap-1 flex-wrap bg-paper-2 border border-rule p-1 rounded-[var(--r-sm)]">
          {subjects.map((s) => (
            <button
              key={s}
              onClick={() => setActiveSubject(s)}
              aria-pressed={activeSubject === s}
              className={`mono flex-1 py-2 px-3 rounded-[6px] transition ${
                activeSubject === s ? 'bg-ink text-paper-2' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="tag animate-pulse">جاري التحميل...</p>
      ) : questions.length === 0 ? (
        <div className="notice">
          <p className="m-0 text-[11px] leading-relaxed">
            مفيش أسئلة لسه في المادة دي، كن أول واحد يسأل من الشات!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="sheet-card p-5">
              <p className="text-sm font-bold text-ink mb-2">{q.question}</p>
              <p className="tag mb-3">
                سأل: {q.user_name} {q.lesson_title ? `· ${q.lesson_title}` : ''}
              </p>

              <div className="space-y-2 mb-3">
                {(answers[q.id] || []).map((a) => (
                  <div
                    key={a.id}
                    className="bg-paper border border-rule rounded-[var(--r-sm)] p-3 text-xs text-ink leading-relaxed"
                  >
                    <p className="m-0">{a.answer}</p>
                    <p className="tag mt-1.5">— {a.user_name}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 items-stretch">
                <input
                  value={answerDraft[q.id] || ''}
                  onChange={(e) => setAnswerDraft((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="اكتب إجابتك..."
                  className="field flex-1 text-xs py-2"
                />
                <button
                  onClick={() => submitAnswer(q.id)}
                  className="btn btn-quiet text-xs px-4 py-2 shrink-0"
                >
                  رد
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
