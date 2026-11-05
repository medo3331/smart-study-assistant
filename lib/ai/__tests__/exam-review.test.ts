import { describe, it, expect, vi } from 'vitest';

import { chunkTranscript } from '../lecture-prompts';
import {
  generateExamReview,
  estimateItemBudget,
  validateExamMcqs,
  dedupeQuestions,
  extractKeyPoints,
  ExamReviewError,
  type ExamReviewDeps,
  type ExamMcq,
} from '../exam-review';
import type { AiUsageContext } from '../usage-context';

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

function mcqJson(count = 2): string {
  return JSON.stringify({
    questions: Array.from({ length: count }, (_, i) => ({
      question: `سؤال رقم ${i}؟`,
      options: ['أ', 'ب', 'ج', 'د'],
      correctAnswer: i % 4,
      explanation: 'لأن المحاضرة ذكرت ذلك صراحة.',
    })),
  });
}

function makeDeps(overrides?: Partial<ExamReviewDeps>) {
  const seen: string[] = [];
  const runTask = vi.fn(
    async (args: { messages: unknown[]; usage: AiUsageContext; temperature: number }) => {
      const aiTask = String(args.usage.diagnostics?.ai_task ?? '');
      seen.push(aiTask);
      return {
        content: aiTask === 'mcq' ? mcqJson(2) : '## عنوان أول\n- نقطة أولى\n- نقطة ثانية',
      };
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
  it('1 chunk → 2 logical, 6 attempts', () => {
    expect(estimateItemBudget(1)).toEqual({ logical: 2, attempts: 6 });
  });

  it('2 chunks → 5 logical, 15 attempts', () => {
    expect(estimateItemBudget(2)).toEqual({ logical: 5, attempts: 15 });
  });

  it('3 chunks → 7 logical, 21 attempts', () => {
    expect(estimateItemBudget(3)).toEqual({ logical: 7, attempts: 21 });
  });
});

describe('generateExamReview', () => {
  it('1 chunk → summary + mcq = 2 logical calls', async () => {
    const { deps, seen } = makeDeps();
    const result = await generateExamReview({ transcript: 'ا'.repeat(9_000), deps });
    expect(result.chunks).toBe(1);
    expect(result.logicalCalls).toBe(2);
    expect(seen).toEqual(['summary', 'mcq']);
  });

  it('2 chunks → 2 summaries + merge + 2 mcq = 5 logical calls', async () => {
    const { deps, seen } = makeDeps();
    const result = await generateExamReview({ transcript: 'ا'.repeat(22_000), deps });
    expect(result.chunks).toBe(2);
    expect(result.logicalCalls).toBe(5);
    expect(seen.filter((t) => t === 'summary')).toHaveLength(2);
    expect(seen.filter((t) => t === 'summary_merge')).toHaveLength(1);
    expect(seen.filter((t) => t === 'mcq')).toHaveLength(2);
  });

  it('runs exactly one mcq call per chunk', async () => {
    const { deps, seen } = makeDeps();
    await generateExamReview({ transcript: 'ا'.repeat(34_000), deps });
    expect(seen.filter((t) => t === 'mcq')).toHaveLength(3);
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
      expect(['summary', 'summary_merge', 'mcq']).toContain(
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

  it('throws INVALID_MCQ_OUTPUT when the model returns bad JSON', async () => {
    const { deps } = makeDeps({
      runTask: vi.fn(async (args: { usage: AiUsageContext }) =>
        String(args.usage.diagnostics?.ai_task) === 'mcq'
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

describe('validateExamMcqs', () => {
  it('accepts a valid 4-option question', () => {
    const parsed = validateExamMcqs({
      questions: [
        { question: 'س؟', options: ['أ', 'ب', 'ج', 'د'], correctAnswer: 2, explanation: 'لأن' },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].correctAnswer).toBe(2);
  });

  it('rejects 3 options', () => {
    expect(() =>
      validateExamMcqs({
        questions: [
          { question: 'س؟', options: ['أ', 'ب', 'ج'], correctAnswer: 0, explanation: 'لأن' },
        ],
      })
    ).toThrow(/exactly 4 options/);
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
});

describe('helpers', () => {
  it('dedupes questions by normalized text', () => {
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
