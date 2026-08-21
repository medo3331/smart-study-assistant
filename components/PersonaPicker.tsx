'use client';

/**
 * 👤 مختار الشخصية والمجال — أول حاجة الزائر بيعملها، وقبل التسجيل.
 *
 * ليه هنا مش في /assessment؟ لأن الاختيار قبل التسجيل هو اللي بيخلي الزائر
 * يحس إن الموقع بقى بتاعه قبل ما يدفع تمن (إيميل وباسورد). التسجيل بيبقى
 * آخر خطوة في التدفق مش أولها.
 *
 * التدفق: شخصية → (مستوى، للطالب بس) → مجال → تراك → تسجيل → /assessment
 * الاختيار عايش في localStorage عبر قفزة التسجيل (شوف lib/user-persona.ts).
 *
 * ⚠️ الاقتراحات = المجال × الشخصية (getTracks). قبل كده كانت ليستة واحدة
 * ثابتة، فاختيار «خريج» كان بيدي نفس اقتراحات «طالب» بالحرف — وكلها برمجة.
 * وخطوة التراك مقفولة لحد ما المجال يتحدد، عشان منعرضش اقتراحات مجال
 * المستخدم لسه مقالش إنه بتاعه.
 *
 * ⚠️ ميزانية اللون: الاختيارات بتتعلّم بالحبر. الزرار الفسفوري في آخر
 * السكشن هو الوحيد اللي بياخد الأصفر، ومفيش ضربة .mark هنا لأن الهيرو
 * فوق خدها خلاص — ضربة واحدة في الشاشة.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import {
  FIELDS,
  PERSONAS,
  STUDENT_LEVELS,
  getTracks,
  isChoiceComplete,
  savePendingChoice,
} from '@/lib/user-persona';
import type { FieldId, Persona, StudentLevel } from '@/lib/user-persona';

export function PersonaPicker() {
  const router = useRouter();
  const { t } = useLanguage();

  const [persona, setPersona] = useState<Persona | null>(null);
  const [studentLevel, setStudentLevel] = useState<StudentLevel | null>(null);
  const [field, setField] = useState<FieldId | null>(null);
  const [subject, setSubject] = useState('');

  // المستوى سؤال للطالب بس. الخريج والفري لانسر بيتخطّوه تماماً.
  const needsLevel = persona === 'student';
  const choice = { persona: persona ?? undefined, studentLevel, field: field ?? undefined, subject };
  const ready = isChoiceComplete(choice);

  // الاقتراحات المعروضة دلوقتي — بتتغير مع أي تغيير في المجال أو الشخصية
  const tracks = field && persona ? getTracks(field, persona) : [];

  // ترقيم الخطوات بيتحرك: لو مفيش مستوى، المجال يبقى ٢ والتراك ٣.
  const fieldStepNumber = needsLevel ? 3 : 2;
  const trackStepNumber = fieldStepNumber + 1;

  /** لو المادة كانت مختارة من الاقتراحات القديمة، متبقاش لها معنى بعد
   *  ما الليستة تتغير. أما لو المستخدم كتبها بإيده، بنسيبها — دي حاجته هو. */
  function clearSubjectIfSuggested(fromField: FieldId | null, fromPersona: Persona | null) {
    if (!fromField || !fromPersona) return;
    const previous = getTracks(fromField, fromPersona);
    if (previous.includes(subject.trim())) setSubject('');
  }

  function handlePersona(next: Persona) {
    if (next === persona) return;
    clearSubjectIfSuggested(field, persona);
    setPersona(next);
    // لو رجع من طالب لغيره، المستوى المخزّن مبيبقاش له معنى
    if (next !== 'student') setStudentLevel(null);
  }

  function handleField(next: FieldId) {
    if (next === field) return;
    clearSubjectIfSuggested(field, persona);
    setField(next);
  }

  function handleSubmit() {
    if (!persona || !field || !ready) return;
    savePendingChoice({ persona, studentLevel, field, subject: subject.trim() });
    router.push('/login?next=/assessment');
  }

  return (
    <section className="band" id="start">
      <p className="eyebrow">{t.picker_eyebrow}</p>
      <h2 className="h2 measure">{t.picker_title}</h2>

      <div className="picker">
        {/* ١ — الشخصية */}
        <div>
          <span className="picker-step-num">01</span>
          <h3 className="h3">{t.picker_step1}</h3>
          <div className="choice-grid" role="group" aria-label={t.picker_step1}>
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="choice"
                aria-pressed={persona === p.id}
                onClick={() => handlePersona(p.id)}
              >
                <span className="choice-emoji" aria-hidden="true">
                  {p.emoji}
                </span>
                <span className="choice-title">{t[p.labelKey]}</span>
                <span className="choice-desc">{t[p.descKey]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ٢ — المستوى: بيظهر جوه نفس السكشن لما يختار طالب */}
        {needsLevel && (
          <div>
            <span className="picker-step-num">02</span>
            <h3 className="h3">{t.picker_step2}</h3>
            <div className="chip-row" role="group" aria-label={t.picker_step2}>
              {STUDENT_LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="chip"
                  aria-pressed={studentLevel === l.id}
                  onClick={() => setStudentLevel(l.id)}
                >
                  {t[l.labelKey]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ٣ — المجال: بيحدّد الاقتراحات اللي تحته ونبرة الشرح */}
        <div>
          <span className="picker-step-num">{String(fieldStepNumber).padStart(2, '0')}</span>
          <h3 className="h3">{t.picker_step_field}</h3>
          <p className="muted small hint">{t.picker_field_hint}</p>

          <div className="chip-row" role="group" aria-label={t.picker_step_field}>
            {FIELDS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="chip"
                aria-pressed={field === f.id}
                onClick={() => handleField(f.id)}
              >
                <span aria-hidden="true">{f.emoji}</span> {t[f.labelKey]}
              </button>
            ))}
          </div>
        </div>

        {/* ٤ — التراك: اقتراحات المجال × الشخصية + حقل حر. الاتنين بيكتبوا في
            نفس الحالة، فالاقتراح المختار بيتعلّم لو النص متطابق معاه بالظبط.
            الخطوة كلها مقفولة لحد ما المجال يتحدد — من غير مجال مفيش
            اقتراحات نعرضها أصلاً. */}
        {field && (
          <div>
            <span className="picker-step-num">{String(trackStepNumber).padStart(2, '0')}</span>
            <h3 className="h3">{t.picker_step3}</h3>
            <p className="muted small hint">{t.picker_track_hint}</p>

            <div className="chip-row" role="group" aria-label={t.picker_step3}>
              {tracks.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="chip"
                  aria-pressed={subject.trim() === label}
                  onClick={() => setSubject(label)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="picker-input-wrap">
              {/* الـ h3 فوق بيوصّف المجموعة بصرياً، فالليبل مخفي عشان قارئ الشاشة بس */}
              <label className="sr-only" htmlFor="picker-subject">
                {t.picker_step3}
              </label>
              <input
                id="picker-subject"
                className="field"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t.picker_track_placeholder}
              />
            </div>
          </div>
        )}

        {/* الإجراء — الزرار الفسفوري الوحيد في السكشن */}
        <div className="picker-foot">
          <button
            type="button"
            className="btn btn-marker"
            disabled={!ready}
            onClick={handleSubmit}
          >
            {t.picker_cta}
          </button>
          {!ready && (
            <p className="muted small no-margin">{t.picker_cta_hint}</p>
          )}
        </div>
      </div>
    </section>
  );
}
