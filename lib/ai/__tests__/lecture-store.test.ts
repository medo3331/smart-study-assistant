/**
 * 📚 اختبار حفظ المحاضرات — `buildLectureRow` (المرحلة ٣)
 *
 * ═══ ليه الاختبار على الدالة النقية تحديداً ═══
 * أخطر حاجة في المرحلة دي هي **ضياع بيانات التفريغ**: لو `transcript_data`
 * اتكتب فيها `text` بس، الـ segments والـ words وتوقيتاتها راحت ومفيش
 * رجوع — والمراحل الجاية (المزامنة الحية، الـ AI، المساعد) كلهم محتاجينها.
 * الاختبار ده بيحرس البند ده **تنفيذياً** مش بالقراءة.
 *
 * ⚠️ كل الاختبارات هنا **صافية** — مفيش Supabase ولا شبكة ولا جلسة.
 * اختبار RLS الحقيقي محتاج قاعدة حيّة، وده **مستحيل** يتأكد منه هنا
 * (شوف تقرير المرحلة ٣: RLS اتراجع بالقراءة، مش اتختبر against live).
 */

import { describe, it, expect } from "vitest";

import { buildLectureRow } from "../lecture-store";
import type {
  LectureTranscript,
  TranscriptSegment,
  TranscriptWord,
} from "../transcription-shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";

/** كلمتين بتوقيتات — زي ما ElevenLabs بيرجّعهم فعلاً. */
const WORDS: TranscriptWord[] = [
  { text: "النهاردة", start: 0, end: 0.8, speaker: null },
  { text: "هنتكلم", start: 0.8, end: 1.6, speaker: null },
  { text: "عن", start: 1.6, end: 1.9, speaker: null },
];

const SEGMENTS: TranscriptSegment[] = [
  { text: "النهاردة هنتكلم عن", start: 0, end: 1.9, speaker: null },
];

/** تفريغ كامل بصيغته الحقيقية — العينة اللي بترجّع من المزوّد. */
function makeTranscript(overrides: Partial<LectureTranscript> = {}): LectureTranscript {
  return {
    text: "النهاردة هنتكلم عن Linear Programming.",
    language: "ar",
    languageProbability: 0.98,
    duration: 1062,
    segments: SEGMENTS,
    words: WORDS,
    model: "scribe_v2",
    provider: "elevenlabs",
    ...overrides,
  };
}

describe("buildLectureRow — حفظ تفريغ كامل", () => {
  it("بيحفظ العقد الكامل في transcript_data من غير قص", () => {
    const transcript = makeTranscript();
    const row = buildLectureRow({
      userId: USER_ID,
      transcript,
      originalFilename: "محاضرة.mp3",
    });

    // ⚠️ الاختبار الأهم في الملف: لازم يكون نسخة **بنيوية متطابقة**
    // من التفريغ كامل — مش نص، ومش مختصر، ومش مقلّم.
    expect(row.transcript_data).toEqual(transcript);
    expect((row.transcript_data as LectureTranscript).segments).toHaveLength(1);
    expect((row.transcript_data as LectureTranscript).words).toHaveLength(3);
  });

  it("بيحافظ على توقيتات الكلمات — دي أساس المزامنة الحية بعدين", () => {
    const row = buildLectureRow({
      userId: USER_ID,
      transcript: makeTranscript(),
      originalFilename: "محاضرة.mp3",
    });

    const data = row.transcript_data as LectureTranscript;
    // التوقيتات لازم تفضل أرقام — لو اتحوّلت لنص بيحصل مع JSON
    // الميكانيكي، المزامنة الحية هتبقى مكسورة من غير أي error ظاهر.
    expect(typeof data.words[0].start).toBe("number");
    expect(data.words[0].start).toBe(0);
    expect(data.words[2].end).toBe(1.9);
    expect(data.segments[0].end).toBe(1.9);
  });

  it("بيحفظ اللغة والموديل والمزوّد كأعمدة top-level", () => {
    const row = buildLectureRow({
      userId: USER_ID,
      transcript: makeTranscript(),
      originalFilename: "محاضرة.mp3",
    });

    expect(row.language).toBe("ar");
    expect(row.transcription_model).toBe("scribe_v2");
    expect(row.transcription_provider).toBe("elevenlabs");
    expect(row.duration_seconds).toBe(1062);
  });

  it("النص المحفوظ = نص التفريغ بالظبط (نفس المصدر، مش مصدر تاني)", () => {
    const transcript = makeTranscript();
    const row = buildLectureRow({
      userId: USER_ID,
      transcript,
      originalFilename: "محاضرة.mp3",
    });

    expect(row.transcript_text).toBe(transcript.text);
    // الفايبرة (derived) لازم تطابق جوّه الـ jsonb — لو اختلفوا، البحث
    // هيلاقي حاجة غير اللي هي معروض للطالب.
    expect(row.transcript_text).toBe(
      (row.transcript_data as LectureTranscript).text,
    );
  });
});
describe("buildLectureRow — ملكية المستخدم", () => {
  it("بيحط user_id جوه الصف — العمود NOT NULL في القاعدة", () => {
    const row = buildLectureRow({
      userId: USER_ID,
      transcript: makeTranscript(),
      originalFilename: "محاضرة.mp3",
    });

    // ⚠️ الاختبار ده بيحرس خطأ حقيقي حصل فعلاً أثناء التطوير: لو
    // `user_id` اتنسى من الصف، الـ insert بيرجع 42501 (not-null
    // violation) و**كل** المحاضرات تفشل حفظ، والسبب ميبانش غير في لوج
    // السيرفر. الإشارة اللي كشفت الخطأ كانت ESLint warning.
    expect(row.user_id).toBe(USER_ID);
  });

  it("بيحتفظ بمعرّف الجلسة زي ما هو من غير تعديل", () => {
    // الدالة نفسها مش بتفرض مين — **الراوت** هو اللي بيجيب الـ id من
    // الجلسة (`user.id`). الاختبار بيوثّق إن الـ id بينتخزن كما هو، فـ
    // RLS في القاعدة هي الفيصل الحقيقي ضد أي حد تاني.
    const row = buildLectureRow({
      userId: USER_ID,
      transcript: makeTranscript(),
      originalFilename: "محاضرة.mp3",
    });

    expect(row.user_id).toBe(USER_ID);
  });

  it("بيولّد id مختلف لكل سطر (المحاضرات مستقلة)", () => {
    const input = {
      userId: USER_ID,
      transcript: makeTranscript(),
      originalFilename: "محاضرة.mp3",
    };

    expect(buildLectureRow(input).id).not.toBe(buildLectureRow(input).id);
  });
});


describe("buildLectureRow — بيانات الملف", () => {
  it("بيشيل الامتداد من العنوان وبيحتفظ بالاسم الأصلي", () => {
    const row = buildLectureRow({
      userId: USER_ID,
      transcript: makeTranscript(),
      originalFilename: "محاضرة 3 - عمليات البحث.mp3",
    });

    expect(row.title).toBe("محاضرة 3 - عمليات البحث");
    // الاسم الأصلي بيفضل متسجّل — الطالب يقدر يعرف مصدر الملف.
    expect(row.original_filename).toBe("محاضرة 3 - عمليات البحث.mp3");
  });

  it("بيستخدم اسم بديل لو الاسم فاضي", () => {
    const row = buildLectureRow({
      userId: USER_ID,
      transcript: makeTranscript(),
      originalFilename: "   ",
    });

    expect(row.title).toBe("محاضرة");
    expect(row.original_filename).toBe("محاضرة");
  });

  it("بيخزّن source_type = upload ودايماً status = completed", () => {
    const row = buildLectureRow({
      userId: USER_ID,
      transcript: makeTranscript(),
      originalFilename: "محاضرة.mp3",
    });

    // ⚠️ القيم دي **لازم** تكون جوه قيم الـ CHECK في db/14-lectures.sql،
    // وإلا الـ insert هيفشل على مستوى القاعدة.
    expect(row.source_type).toBe("upload");
    expect(row.status).toBe("completed");
  });

  it("بيخزّن storage_path عشان إعادة المحاولة ما تعملش تكرار", () => {
    const path = "2026/09/30/abc-123.mp3";
    const row = buildLectureRow({
      userId: USER_ID,
      transcript: makeTranscript(),
      originalFilename: "محاضرة.mp3",
      storagePath: path,
    });

    // المسار ده هو مفتاح الـ upsert (user_id, storage_path).
    expect(row.storage_path).toBe(path);
  });

  it("بيسيب storage_path null لو مفيش مسار (تسجيل مباشر جاي)", () => {
    const row = buildLectureRow({
      userId: USER_ID,
      transcript: makeTranscript(),
      originalFilename: "محاضرة.mp3",
      storagePath: null,
    });

    // القيد الفريد بيسمح بـ NULL (Postgres بيعاملها كقيم متمايزة) —
    // فالتسجيل المباشر مش هيخنق نفسه في المرحلة ٧.
    expect(row.storage_path).toBeNull();
  });
});

describe("buildLectureRow — قيم ناقصة أو خايبة", () => {
  it("المدة null بتفضل null (مش 0)", () => {
    const row = buildLectureRow({
      userId: USER_ID,
      // ElevenLabs بيرجّع null لما ميفقدش يقيس — و0 معناه "صفر ثانية"
      // وده كدب في العرض (بيطلع "0:00" كأن المحاضرة فاضية).
      transcript: makeTranscript({ duration: null }),
      originalFilename: "محاضرة.mp3",
    });

    expect(row.duration_seconds).toBeNull();
  });

  it("المدة بتتقرب لعدد صحيح (العمود integer)", () => {
    const row = buildLectureRow({
      userId: USER_ID,
      transcript: makeTranscript({ duration: 1062.7 }),
      originalFilename: "محاضرة.mp3",
    });

    expect(row.duration_seconds).toBe(1063);
    expect(Number.isInteger(row.duration_seconds)).toBe(true);
  });

  it("حجم سالب بيبقى null (مش رقم بيتكسر في الـ bigint)", () => {
    const row = buildLectureRow({
      userId: USER_ID,
      transcript: makeTranscript(),
      originalFilename: "محاضرة.mp3",
      fileSize: -5,
    });

    expect(row.file_size).toBeNull();
  });

  it("تفريغ من غير مقاطع ولا كلمات لسه بيتحفظ (مش بيترفض)", () => {
    // حالة حقيقية: الـ words مش بتيجي غير لما الـ granularity يسمح.
    // الرفض كان هيخسر تفريغ ممتاز لمجرد إن الـ words مش موجودة.
    const row = buildLectureRow({
      userId: USER_ID,
      transcript: makeTranscript({ segments: [], words: [] }),
      originalFilename: "محاضرة.mp3",
    });

    expect(row.transcript_data).toEqual(
      makeTranscript({ segments: [], words: [] }),
    );
    expect(row.transcript_text).toBeTruthy();
  });
});
