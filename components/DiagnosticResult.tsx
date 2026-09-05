import React, { useState, useEffect } from "react";
export interface ExamQuestion { id: string; question_text: string; options: string[]; correct_option_index: number; difficulty: string; source_reference: string; }
export default function ExamQuestionBank({ subjectId }: { subjectId: string }) {
  const [qs,setQs]=useState<ExamQuestion[]>([]); const [ld,setLd]=useState(true);
  useEffect(()=>{ setLd(true); (async()=>{ try { const s=await (await fetch("/api/diagnostic/questions?subject_id="+subjectId)).json(); setQs(s||[]); } catch{setQs([]);} setLd(false); })(); },[subjectId]);
  if(ld)return <div dir="rtl">جارٍ التحميل...</div>;
  if(qs.length===0)return <div dir="rtl">لا توجد أسئلة منشورة حالياً.</div>;
  return (
    <div dir="rtl" className="w-full max-w-2xl mx-auto p-6 space-y-4">
      <h2 className="text-xl font-bold">بنك الأسئلة — الرياضيات</h2>
      {qs.map((q,i)=>(
        <div key={q.id} className="p-4 rounded-xl bg-[var(--card)] border">
          <div className="font-bold">{i+1}. {q.question_text}</div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {q.options.map((opt,j)=>(
              <button key={j} className="p-2 rounded border text-right hover:bg-[var(--accent)]">{String.fromCharCode(65+j)}. {opt}</button>
            ))}
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">المصدر: {q.source_reference||"MOE"} • صعوبة: {q.difficulty}</div>
        </div>
      ))}
    </div>
  );
}
