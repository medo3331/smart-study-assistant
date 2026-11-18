import { describe, it, expect, vi } from 'vitest';

import { chunkTranscript } from '../lecture-prompts';
import {
  generateExamReview,
  estimateItemBudget,
  parseExamSpec,
  normalizeExamSpec,
  validateExamMcqs,
  validateExamQuestion,
  dedupeQuestions,
  extractKeyPoints,
  ExamReviewError,
  DEFAULT_EXAM_SPEC,
  EXAM_MIN_COUNT,
  EXAM_MAX_COUNT,
  type ExamReviewDeps,
  type ExamMcq,
  type ExamQuestionType,
  type ExamSpec,
} from '../exam-review';
import type { AiUsageContext } from '../usage-context';
import type { AiChatMessage } from '../types';

const SESSION_ID = 's1';
const LECTURE_ID = 'l1';

function usageForTask(aiTask: string): AiUsageContext {
  return {
    operationId: 'op-1',
    idempotencyKey: `exam:${SESSION_ID}:${LECTURE_ID}:${aiTask}`,
    source: 'server',
    userId: 'u1',
    feature: 'exam_review',
    diagnostics: {
      exam_session_id: SESSION_ID,
      lecture_id: LECTURE_ID,
      ai_task: aiTask,
    },
  };
}

/** قراءة العدد المطلوب من البرومبت «اكتب بالضبط N سؤالًا» — يديرها الـmock. */
function promptQuota(messages: AiChatMessage[]): number {
  const system = String(messages.find((m) => m.role === 'system')?.content ?? '');
  const match = /بالضبط\s+(\d+)\s+سؤال/.exec(system);
  return match ? Number(match[1]) : 2;
}

function questionItem(type: ExamQuestionType, index: number) {
  if (type === 'mcq') {
    return {
      type: 'mcq',
      question: `سؤال اختيار ${index}؟`,
      options: ['أ', 'ب', 'ج', 'د'],
      correctAnswer: index % 4,
      explanation: 'لأن المحاضرة ذكرت ذلك صراحة.',
    };
  }
  if (type === 'true_false') {
    return {
      type: 'true_false',
      question: `صح أم خطأ ${index}؟`,
      correct: index % 2 === 0,
      explanation: 'لأن التفريغ أكده مباشرة.',
    };
  }
  return {
    type: 'essay',
    question: `اشرح بالتفصيل النقطة رقم ${index}؟`,
    modelAnswer: 'إجابة نموذجية مستمدة حرفيًا من تفريغ المحاضرة كما وردت هناك.',
    rubric: ['ذكر التعريف من التفريغ', 'ذكر المثال الوارد', 'ربط الفقرات ببعضها'],
    maxScore: 5,
  };
}

function questionsJson(count: number, types: ExamQuestionType[], base = 0): string {
  return JSON.stringify({
    questions: Array.from({ length: count }, (_, i) =>
      questionItem(types[i % types.length], base + i + 1)
    ),
  });
}

/**
 * الموديل الافتراضي: يلتزم بالعدد والأنواع المطلوبة — ونصوص السؤال
 * **فارقة بين نداءات القطع** (الـdedupe بيشيل التكرار بصدق، فلو النصوص
 * متطابقة بين القطع كان الـfinal هيقصر ويلغي الالتزام بالعدد).
 */
function createDefaultResponder() {
  let questionsCall = 0;
  return (aiTask: string, messages: AiChatMessage[]): string => {
    if (aiTask === 'questions' || aiTask === 'questions_repair') {
      questionsCall += 1;
      const quota = promptQuota(messages);
      // نوع واحد بس مطلوب في المسارات الافتراضية (mcq).
      return questionsJson(quota, ['mcq'], questionsCall * 100);
    }
    return '## الفصل الأول\n- تعريف مهم\n- مثال من المحاضرة\n\n## الفصل الثاني\n- نتيجة';
  };
}

function makeDeps(
  overrides?: Partial<ExamReviewDeps>,
  responder: (aiTask: string, messages: AiChatMessage[]) => string = createDefaultResponder()
) {
  const seen: string[] = [];
  const runTask = vi.fn(
    async (args: { messages: AiChatMessage[]; usage: AiUsageContext; temperature: number }) => {
      const aiTask = String(args.usage.diagnostics?.ai_task ?? '');
      seen.push(aiTask);
      return { content: responder(aiTask, args.messages) };
    }
  );
  const afterCall = vi.fn(async () => {});
  const deps: ExamReviewDeps = {
    runTask,
    chunk: chunkTranscript,
    chunkChars: 12_000,
    usageFor: (task) => usageForTask(task),
    afterCall,
    ...overrides,
  };
  return { deps, seen, runTask, afterCall };
}

const SUMMARY_MD = '## الفصل الأول\n- تعريف مهم\n- مثال من المحاضرة\n\n## الفصل الثاني\n- نتيجة';

describe('chunking (reuse of chunkTranscript)', () => {
  it('10K chars → 1 chunk', () => {
    expect(chunkTranscript('ا'.repeat(10_000), 12_000)).toHaveLength(1);
  });

  it('22K chars → 2 chunks', () => {
    expect(chunkTranscript('ا'.repeat(22_000), 12_000)).toHaveLength(2);
  });

  it('34K chars → 3 chunks', () => {
    expect(chunkTranscript('ا'.repeat(34_000), 12_000)).toHaveLength(3);
  });
});

describe('estimateItemBudget', () => {
  it('1 chunk →2 logical,6 attempts', () => {
    expect(estimateItemBudget(1)).toEqual({ logical: 2, attempts: 6 });
  });

  it('2 chunks →5 logical,15 attempts', () => {
    expect(estimateItemBudget(2)).toEqual({ logical: 5, attempts: 15 });
  });

  it('3 chunks →7 logical,21 attempts', () => {
    expect(estimateItemBudget(3)).toEqual({ logical: 7, attempts: 21 });
  });
});

describe('parseExamSpec (strict — للراوت)', () => {
  const valid: ExamSpec = { types: ['mcq', 'essay'], difficulty: 'hard', count: 12 };

  it('accepts a full valid spec', () => {
    expect(parseExamSpec(valid)).toEqual(valid);
  });

  it('accepts a single type', () => {
    expect(parseExamSpec({ types: ['essay'], difficulty: 'easy', count: 5 })).toEqual({
      types: ['essay'],
      difficulty: 'easy',
      count: 5,
    });
  });

  it('rejects unknown type', () => {
    expect(parseExamSpec({ ...valid, types: ['mcq', 'fill'] })).toBeNull();
  });

  it('rejects duplicate types', () => {
    expect(parseExamSpec({ ...valid, types: ['mcq', 'mcq'] })).toBeNull();
  });

  it('rejects empty types', () => {
    expect(parseExamSpec({ ...valid, types: [] })).toBeNull();
  });

  it('rejects invalid difficulty', () => {
    expect(parseExamSpec({ ...valid, difficulty: 'insane' })).toBeNull();
  });

  it(`rejects count below ${EXAM_MIN_COUNT} or above ${EXAM_MAX_COUNT}`, () => {
    expect(parseExamSpec({ ...valid, count: EXAM_MIN_COUNT - 1 })).toBeNull();
    expect(parseExamSpec({ ...valid, count: EXAM_MAX_COUNT + 1 })).toBeNull();
    expect(parseExamSpec({ ...valid, count: 4.5 })).toBeNull();
    expect(parseExamSpec({ ...valid, count: '12' })).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(parseExamSpec(null)).toBeNull();
    expect(parseExamSpec('mcq')).toBeNull();
    expect(parseExamSpec(undefined)).toBeNull();
  });
});

describe('normalizeExamSpec (lenient — لقراءة metadata)', () => {
  it('falls back to defaults on garbage', () => {
    expect(normalizeExamSpec(undefined)).toEqual(DEFAULT_EXAM_SPEC);
    expect(normalizeExamSpec('nope')).toEqual(DEFAULT_EXAM_SPEC);
  });

  it('drops invalid entries and keeps valid ones', () => {
    const spec = normalizeExamSpec({
      types: ['mcq', 'fill', 'essay'],
      difficulty: 'hard',
      count: 999,
    });
    expect(spec.types).toEqual(['mcq', 'essay']);
    expect(spec.difficulty).toBe('hard');
    expect(spec.count).toBe(20); // قُصّ عند السقف
  });

  it('defaults types to mcq when missing', () => {
    expect(normalizeExamSpec({}).types).toEqual(['mcq']);
  });
});

describe('generateExamReview — الالتزام بـspec', () => {
  it('1 chunk → summary + questions =2 logical calls', async () => {
    const { deps, seen } = makeDeps();
    const result = await generateExamReview({ transcript: 'ا'.repeat(9_000), deps });
    expect(result.chunks).toBe(1);
    expect(result.logicalCalls).toBe(2);
    expect(seen).toEqual(['summary', 'questions']);
    expect(result.review.questions).toHaveLength(DEFAULT_EXAM_SPEC.count);
  });

  it('2 chunks →2 summaries + merge +2 questions =5 logical calls', async () => {
    const { deps, seen } = makeDeps();
    const result = await generateExamReview({ transcript: 'ا'.repeat(22_000), deps });
    expect(result.chunks).toBe(2);
    expect(result.logicalCalls).toBe(5);
    expect(seen.filter((t) => t === 'summary')).toHaveLength(2);
    expect(seen.filter((t) => t === 'summary_merge')).toHaveLength(1);
    expect(seen.filter((t) => t === 'questions')).toHaveLength(2);
    expect(result.review.questions).toHaveLength(DEFAULT_EXAM_SPEC.count);
  });

  it('runs exactly one questions call per chunk (no repair when compliant)', async () => {
    const { deps, seen } = makeDeps();
    await generateExamReview({ transcript: 'ا'.repeat(34_000), deps });
    expect(seen.filter((t) => t === 'questions')).toHaveLength(3);
    expect(seen).not.toContain('questions_repair');
  });

  it('puts types + difficulty + group quota in the prompt', async () => {
    const { deps, runTask } = makeDeps(undefined, (aiTask, messages) => {
      if (aiTask === 'questions' || aiTask === 'questions_repair') {
        return questionsJson(promptQuota(messages), ['essay']);
      }
      return SUMMARY_MD;
    });
    await generateExamReview({
      transcript: 'ا'.repeat(9_000),
      deps,
      spec: { types: ['essay'], difficulty: 'hard', count: 12 },
    });
    // ⚠️ بعد التقسيم: 12 سؤال ⇒ 3 مجموعات (5/5/2) — مافيش نداء فوق 5.
    const quotas = runTask.mock.calls
      .filter((call) => {
        const usage = (call[0] as { usage: AiUsageContext }).usage;
        return usage.diagnostics?.ai_task === 'questions';
      })
      .map((call) => promptQuota((call[0] as { messages: AiChatMessage[] }).messages));
    expect(quotas).toEqual([5, 5, 2]);
    expect(quotas.reduce((sum, value) => sum + value, 0)).toBe(12);

    const system = String(
      (runTask.mock.calls[1]?.[0] as { messages: AiChatMessage[] }).messages[0].content
    );
    expect(system).toContain('مقالي');
    expect(system).toContain('hard');
    expect(system).toContain('تحليل');
  });

  it('generates only the requested type', async () => {
    const { deps } = makeDeps(undefined, (aiTask, messages) => {
      if (aiTask === 'questions' || aiTask === 'questions_repair') {
        return questionsJson(promptQuota(messages), ['true_false']);
      }
      return SUMMARY_MD;
    });
    const result = await generateExamReview({
      transcript: 'ا'.repeat(9_000),
      deps,
      spec: { types: ['true_false'], difficulty: 'easy', count: 5 },
    });
    expect(result.review.questions).toHaveLength(5);
    expect(result.review.questions.every((q) => q.type === 'true_false')).toBe(true);
  });

  it('drops questions of unrequested types', async () => {
    const { deps } = makeDeps(undefined, (aiTask, messages) => {
      if (aiTask === 'questions' || aiTask === 'questions_repair') {
        // الموديل بيلخبط: بينزّل mcq جنب المقالي — الغلط يتقص والصحيح يفضل.
        return questionsJson(promptQuota(messages), ['essay', 'mcq']);
      }
      return SUMMARY_MD;
    });
    const result = await generateExamReview({
      transcript: 'ا'.repeat(9_000),
      deps,
      spec: { types: ['essay'], difficulty: 'medium', count: 5 },
    });
    expect(result.review.questions.every((q) => q.type === 'essay')).toBe(true);
  });

  it('calls questions_repair once when a selected type is missing', async () => {
    const { deps, seen } = makeDeps(undefined, (aiTask, messages) => {
      if (aiTask === 'questions') {
        return questionsJson(promptQuota(messages), ['mcq']); // ناسي المقالي
      }
      if (aiTask === 'questions_repair') {
        return questionsJson(promptQuota(messages), ['essay']);
      }
      return SUMMARY_MD;
    });
    const result = await generateExamReview({
      transcript: 'a'.repeat(9_000),
      deps,
      spec: { types: ['mcq', 'essay'], difficulty: 'medium', count: 6 },
    });
    expect(seen).toContain('questions_repair');
    const types = new Set(result.review.questions.map((q) => q.type));
    expect(types.has('mcq')).toBe(true);
    expect(types.has('essay')).toBe(true);
    expect(result.review.questions).toHaveLength(6);
    // ⚠️ 4 نداءات منطقية: ملخص + مجموعتين أسئلة (6 ⇒ 5/1) + نداء إصلاح.
    expect(result.logicalCalls).toBe(4);
  });

  it('throws SPEC_UNFULFILLED when repair still misses a requested type', async () => {
    const { deps } = makeDeps(undefined, (aiTask, messages) => {
      if (aiTask === 'questions' || aiTask === 'questions_repair') {
        return questionsJson(promptQuota(messages), ['mcq']); // الإصلاح كمان ناسي المقالي
      }
      return SUMMARY_MD;
    });
    await expect(
      generateExamReview({
        transcript: 'a'.repeat(9_000),
        deps,
        spec: { types: ['mcq', 'essay'], difficulty: 'medium', count: 5 },
      })
    ).rejects.toMatchObject({ code: 'SPEC_UNFULFILLED' });
  });

  it('passes exam_session_id + lecture_id + ai_task in every usage context', async () => {
    const { deps, runTask } = makeDeps();
    await generateExamReview({ transcript: 'ا'.repeat(9_000), deps });
    for (const call of runTask.mock.calls) {
      const usage = (call[0] as { usage: AiUsageContext }).usage;
      expect(usage.diagnostics).toMatchObject({
        exam_session_id: SESSION_ID,
        lecture_id: LECTURE_ID,
      });
      expect(['summary', 'summary_merge', 'questions', 'questions_repair']).toContain(
        String(usage.diagnostics?.ai_task)
      );
      expect(usage.idempotencyKey.length).toBeGreaterThan(0);
    }
  });

  it('renewal hook is called once per logical call', async () => {
    const { deps, afterCall } = makeDeps();
    const result = await generateExamReview({ transcript: 'ا'.repeat(22_000), deps });
    expect(result.logicalCalls).toBe(5);
    expect(afterCall).toHaveBeenCalledTimes(5);
  });

  it('returns key_points derived locally (no extra AI call)', async () => {
    const { deps, seen } = makeDeps();
    const result = await generateExamReview({ transcript: 'ا'.repeat(9_000), deps });
    expect(result.review.key_points.length).toBeGreaterThan(0);
    expect(seen).toHaveLength(2); // لم يُضَف أي نداء للنقاط
  });

  it('throws EMPTY_TRANSCRIPT on blank input', async () => {
    const { deps } = makeDeps();
    await expect(generateExamReview({ transcript: '   ', deps })).rejects.toMatchObject({
      code: 'EMPTY_TRANSCRIPT',
    });
  });

  it('throws INVALID_QUESTIONS_OUTPUT when the model returns bad JSON', async () => {
    const { deps } = makeDeps({
      runTask: vi.fn(async (args: { usage: AiUsageContext }) =>
        String(args.usage.diagnostics?.ai_task) === 'questions'
          ? { content: 'not json at all' }
          : { content: SUMMARY_MD }
      ),
      usageFor: (task) => usageForTask(task),
    });
    await expect(generateExamReview({ transcript: 'ا'.repeat(9_000), deps })).rejects.toBeInstanceOf(
      ExamReviewError
    );
  });

  it('propagates a lease-lost error from the renewal hook', async () => {
    const { deps } = makeDeps({
      afterCall: async () => {
        throw new Error('lease lost');
      },
    });
    await expect(generateExamReview({ transcript: 'ا'.repeat(9_000), deps })).rejects.toThrow(
      'lease lost'
    );
  });
});

describe('validateExamMcqs (الشكل القديم للتوافق)', () => {
  it('accepts a valid4-option question', () => {
    const parsed = validateExamMcqs({
      questions: [
        { question: 'س؟', options: ['أ', 'ب', 'ج', 'د'], correctAnswer: 2, explanation: 'لأن' },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].correctAnswer).toBe(2);
  });

  it('rejects3 options', () => {
    expect(() =>
      validateExamMcqs({
        questions: [
          { question: 'س؟', options: ['أ', 'ب', 'ج'], correctAnswer: 0, explanation: 'لأن' },
        ],
      })
    ).toThrow(/exactly\s*4 options/);
  });

  it('rejects an out-of-range correctAnswer', () => {
    expect(() =>
      validateExamMcqs({
        questions: [
          { question: 'س؟', options: ['أ', 'ب', 'ج', 'د'], correctAnswer: 4, explanation: 'لأن' },
        ],
      })
    ).toThrow(/0\.\.3/);
  });

  it('rejects unknown keys', () => {
    expect(() =>
      validateExamMcqs({
        questions: [
          {
            question: 'س؟',
            options: ['أ', 'ب', 'ج', 'د'],
            correctAnswer: 0,
            explanation: 'لأن',
            bonus: true,
          },
        ],
      })
    ).toThrow(/Unexpected key/);
  });

  it('rejects duplicate options', () => {
    expect(() =>
      validateExamMcqs({
        questions: [
          { question: 'س؟', options: ['أ', 'أ', 'ج', 'د'], correctAnswer: 0, explanation: 'لأن' },
        ],
      })
    ).toThrow(/distinct options/);
  });
});

describe('validateExamQuestion — الأنواع الجديدة', () => {
  it('accepts a valid true/false question', () => {
    const q = validateExamQuestion(
      { type: 'true_false', question: 'س؟', correct: true, explanation: 'لأن' },
      ['true_false']
    );
    expect(q.type).toBe('true_false');
    if (q.type === 'true_false') expect(q.correct).toBe(true);
  });

  it('rejects non-boolean correct in true/false', () => {
    expect(() =>
      validateExamQuestion(
        { type: 'true_false', question: 'س؟', correct: 'صح', explanation: 'لأن' },
        ['true_false']
      )
    ).toThrow(/boolean/);
  });

  it('accepts a valid essay question', () => {
    const q = validateExamQuestion(
      {
        type: 'essay',
        question: 'اشرح؟',
        modelAnswer: 'إجابة نموذجية من التفريغ بتفصيل كافٍ.',
        rubric: ['أ', 'ب', 'ج'],
        maxScore: 5,
      },
      ['essay']
    );
    expect(q.type).toBe('essay');
  });

  it('rejects essay with short modelAnswer', () => {
    expect(() =>
      validateExamQuestion(
        {
          type: 'essay',
          question: 'اشرح؟',
          modelAnswer: 'قصير',
          rubric: ['أ', 'ب', 'ج'],
          maxScore: 5,
        },
        ['essay']
      )
    ).toThrow(/20 characters/);
  });

  it('rejects essay with2 rubric points', () => {
    expect(() =>
      validateExamQuestion(
        {
          type: 'essay',
          question: 'اشرح؟',
          modelAnswer: 'إجابة نموذجية من التفريغ بتفصيل كافٍ.',
          rubric: ['أ', 'ب'],
          maxScore: 5,
        },
        ['essay']
      )
    ).toThrow(/3\.\.5 points/);
  });

  it('rejects essay with maxScore !=5', () => {
    expect(() =>
      validateExamQuestion(
        {
          type: 'essay',
          question: 'اشرح؟',
          modelAnswer: 'إجابة نموذجية من التفريغ بتفصيل كافٍ.',
          rubric: ['أ', 'ب', 'ج'],
          maxScore: 3,
        },
        ['essay']
      )
    ).toThrow(/maxScore/);
  });

  it('rejects a type the student did not select', () => {
    expect(() =>
      validateExamQuestion(
        { type: 'mcq', question: 'س؟', options: ['أ', 'ب', 'ج', 'د'], correctAnswer: 0, explanation: 'لأن' },
        ['essay']
      )
    ).toThrow(/not requested/);
  });

  it('rejects missing type when multiple types are allowed', () => {
    expect(() =>
      validateExamQuestion(
        { question: 'س؟', options: ['أ', 'ب', 'ج', 'د'], correctAnswer: 0, explanation: 'لأن' },
        ['mcq', 'essay']
      )
    ).toThrow(/type/);
  });

  it('infers mcq when it is the only selected type', () => {
    const q = validateExamQuestion(
      { question: 'س؟', options: ['أ', 'ب', 'ج', 'د'], correctAnswer: 1, explanation: 'لأن' },
      ['mcq']
    );
    expect(q.type).toBe('mcq');
  });
});

describe('helpers', () => {
  it('dedupes questions by normalized text (across shapes)', () => {
    const base: ExamMcq = {
      question: 'ما هو الـ Normalization؟',
      options: ['أ', 'ب', 'ج', 'د'],
      correctAnswer: 0,
      explanation: 'لأن',
    };
    const dup: ExamMcq = { ...base, question: 'ما هو ال normalization' };
    expect(dedupeQuestions([base, dup])).toHaveLength(1);
  });

  it('extracts headings and bullets as key points', () => {
    const points = extractKeyPoints(SUMMARY_MD);
    expect(points).toContain('الفصل الأول');
    expect(points.some((p) => p.includes('تعريف مهم'))).toBe(true);
  });
});
