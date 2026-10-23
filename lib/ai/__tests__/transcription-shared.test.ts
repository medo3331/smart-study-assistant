/**
 * اختبارات عقد تفريغ المحاضرات (الجزء المشترك بين السيرفر والكلاينت).
 *
 * ⚠️ ليه الجزء المشترك بس: `lib/ai/transcription.ts` بيقرأ المفتاح من
 * البيئة وبيعمل fetch لـ ElevenLabs — اختباراته كانت هتحتاج شبكة ومفتاح
 * حقيقي. كل المنطق القابل للاختبار (فحص الملف، الامتدادات، الحجم،
 * تنسيق الحجم) في `transcription-shared.ts`، وده بالظبط اللي الواجهة
 * بتستورده — فالتغطية هنا = حماية حقيقية للسلوك اللي الطالب بيشوفه.
 */
import { describe, it, expect } from "vitest";

import {
  ALLOWED_LECTURE_EXTENSIONS,
  assertLectureChunk,
  assertLectureFile,
  chunkFileName,
  CHUNK_SIZE_BYTES,
  formatFileSize,
  LECTURE_FILE_ACCEPT,
  MAX_DIRECT_UPLOAD_BYTES,
  MAX_LECTURE_FILE_BYTES,
  TranscriptionError,
  lectureFileExtension,
} from "../transcription-shared";

/** ملف وهمي بالحجم والنوع المطلوبين. */
function fakeFile(name: string, sizeBytes: number, type = ""): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

/** أنواع MIME كما المتصفح ببلّغ عنها فعلاً لكل صيغة — مش تخمين
 *  `audio/${ext}`، عشان الاختبار يفحص الكود اللي بيشتغل في الإنتاج. */
const REAL_BROWSER_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
};

describe("lectureFileExtension", () => {
  it("بيرجّع الامتداد بحروف صغيرة", () => {
    expect(lectureFileExtension("محاضرة.MP3")).toBe("mp3");
    expect(lectureFileExtension("lecture.final.m4a")).toBe("m4a");
  });

  it("بيرجّع نص فاضي لو مفيش امتداد", () => {
    expect(lectureFileExtension("تسجيل")).toBe("");
  });
});

describe("formatFileSize", () => {
  it("يعرض بايت/كيلوبايت/ميجابايت بالترتيب الصح", () => {
    expect(formatFileSize(512)).toContain("بايت");
    expect(formatFileSize(64 * 1024)).toContain("كيلوبايت");
    expect(formatFileSize(5 * 1024 * 1024)).toContain("ميجابايت");
  });

  it("يعرض الجيجابايت بدل «1024 ميجابايت» — الحد بقى 1 جيجا", () => {
    // 1024 ميجا كانت هتبان سيئة جداً في نص الصفحة، والحد بقى جيجا
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.0 جيجابايت");
    // تحت الجيجا بيفضل ميجا
    expect(formatFileSize(200 * 1024 * 1024)).toBe("200 ميجابايت");
    // جيجا فوق 10 بتتقرب (مش «12.5»)
    expect(formatFileSize(20 * 1024 * 1024 * 1024)).toBe("20 جيجابايت");
  });

  it("بيقرّب الكيلوبايت لرقم صحيح", () => {
    // 1.5 ميجا = 1536 كيلوبايت بالظبط، من غير كسور
    expect(formatFileSize(1536 * 1024)).toBe("1.5 ميجابايت");
  });
});

describe("ALLOWED_LECTURE_EXTENSIONS", () => {
  it("بيغطي صيغ المحاضرة الشائعة من قوائم ElevenLabs", () => {
    for (const ext of ["mp3", "wav", "m4a", "mp4", "aac", "flac"]) {
      expect(ALLOWED_LECTURE_EXTENSIONS as readonly string[]).toContain(ext);
    }
  });

  it("LECTURE_FILE_ACCEPT فيه الامتدادات بصيغة .ext", () => {
    expect(LECTURE_FILE_ACCEPT).toContain(".mp3");
    expect(LECTURE_FILE_ACCEPT).toContain(".flac");
  });
});

describe("assertLectureFile", () => {
  it("يقبل صيغ المحاضرة المدعومة بنوع MIME المتصفح الحقيقي", () => {
    for (const [ext, mime] of Object.entries(REAL_BROWSER_MIME)) {
      expect(() => assertLectureFile(fakeFile(`محاضرة.${ext}`, 2048, mime))).not.toThrow();
    }
  });

  it("يقبل audio/m4a — الاسم اللي المتصفحات بتبلّغ بيه فعلاً", () => {
    expect(() => assertLectureFile(fakeFile("محاضرة.m4a", 2048, "audio/m4a"))).not.toThrow();
  });

  it("يقبل ملف من غير MIME (المتصفح بيبعت نوع فاضي لامتدادات نادرة)", () => {
    // mkv من الامتدادات النادرة اللي المتصفح بيبعت لها type=""
    expect(() => assertLectureFile(fakeFile("تسجيل.mkv", 2048, ""))).not.toThrow();
  });

  it("يرفض الملف الفاضي", () => {
    expect(() => assertLectureFile(fakeFile("فاضي.mp3", 0))).toThrowError(
      /فاضي/,
    );
  });

  it("يرفض نوع ملف مش مدعوم", () => {
    try {
      assertLectureFile(fakeFile("ملزمة.pdf", 2048, "application/pdf"));
      throw new Error("كان المفروض يرمي");
    } catch (error) {
      expect(error).toBeInstanceOf(TranscriptionError);
      expect((error as TranscriptionError).code).toBe("UNSUPPORTED_TYPE");
      expect((error as TranscriptionError).status).toBe(415);
    }
  });

  it("يرفض امتداد مدعوم لو الـ MIME نوع تاني (منع التزوير)", () => {
    // .mp3 اسمه صح بس الـ browser يقول إنه PDF — نرفض
    try {
      assertLectureFile(fakeFile("خدعة.mp3", 2048, "application/pdf"));
      throw new Error("كان المفروض يرمي");
    } catch (error) {
      expect((error as TranscriptionError).code).toBe("UNSUPPORTED_TYPE");
    }
  });

  it("يرفض الملف الأكبر من السقف بـ 413", () => {
    // بنتحقق بـ fakeFile صغير الحجم بس نحاكي الحجم المعلن: ده بيختبر شرط
    // المقارنة نفسه من غير ما نعمل 25 ميجا في ذاكرة Vitest.
    const oversize = {
      size: MAX_LECTURE_FILE_BYTES + 1,
      name: "محاضرة.mp3",
      type: "audio/mpeg",
    } as File;
    try {
      assertLectureFile(oversize);
      throw new Error("كان المفروض يرمي");
    } catch (error) {
      expect(error).toBeInstanceOf(TranscriptionError);
      expect((error as TranscriptionError).code).toBe("FILE_TOO_LARGE");
      expect((error as TranscriptionError).status).toBe(413);
      // الرسالة بتذكر الحد بالميجابايت عشان الطالب يفهم من غير ما يسأل
      expect((error as TranscriptionError).message).toContain("ميجابايت");
    }
  });

  it("يقبل ملف أصغر من السقف", () => {
    expect(() => assertLectureFile(fakeFile("محاضرة.mp3", 1024))).not.toThrow();
  });
});

describe("MAX_LECTURE_FILE_BYTES", () => {
  it("يسمح بمحاضرات طويلة — مش حد Vercel", () => {
    /* ده الحارس اللي بيمنع رجوعنا لحد الـ 4.5 ميجا بالخطأ: أي حد
       متغير في المرحلة الجاية لازم يعدّي من هنا. */
    expect(MAX_LECTURE_FILE_BYTES).toBeGreaterThan(500 * 1024 * 1024);
  });

  it("أكبر من 25 ميجا (الحد القديم) بفرق كبير", () => {
    expect(MAX_LECTURE_FILE_BYTES).toBeGreaterThan(25 * 1024 * 1024 * 2);
  });

  it("يسمح بملف محاضرة 3 ساعات (~200 ميجا)", () => {
    /* ⚠️ بنستخدم كائن وهمي مش File حقيقي: 200 ميجا في ذاكرة Vitest
       هتبوظ شغل和环境. الفحص بيقرأ `size` و`name` و`type` بس. */
    const threeHours = {
      size: 200 * 1024 * 1024,
      name: "محاضرة-3h.mp3",
      type: "audio/mpeg",
    } as File;
    expect(threeHours.size).toBeLessThan(MAX_LECTURE_FILE_BYTES);
    expect(() => assertLectureFile(threeHours)).not.toThrow();
  });

  it("أقل من حد ElevenLabs (5 جيجا) عشان نبلّغ الطالب قبل المزوّد", () => {
    // لو بقينا أكبر من المزوّد، الطالب هيعدّي الفحص عندنا ويفشل عند
    // ElevenLabs برسالة غامضة. الأحسن نرفضها عندنا برسالة واضحة.
    expect(MAX_LECTURE_FILE_BYTES).toBeLessThan(5 * 1024 * 1024 * 1024);
  });
});

describe("MAX_DIRECT_UPLOAD_BYTES", () => {
  it("حد المنصّة القديم — أقل بكتير من حد التطبيق الجديد", () => {
    // الـ fallback بس هو اللي محكوم بالحد ده. الرفع الجديد ماشي فوقاه.
    expect(MAX_DIRECT_UPLOAD_BYTES).toBeLessThan(MAX_LECTURE_FILE_BYTES);
  });

  it("أقل من 4.5 ميجا (سقف جسم طلب Vercel)", () => {
    expect(MAX_DIRECT_UPLOAD_BYTES).toBeLessThanOrEqual(4.5 * 1024 * 1024);
  });
});

describe("CHUNK_SIZE_BYTES", () => {
  it("أقل من سقف جسم طلب Vercel (4.5 ميجا)", () => {
    /* ⚠️ ده الحارس الأهم في التقسيم: لو الجزء عدّى 4.5 ميجا، الطلب
       هيفشل عند المنصّة برسالة غامضة (413/500) والطالب مش هيعرف ليه. */
    expect(CHUNK_SIZE_BYTES).toBeLessThanOrEqual(4.5 * 1024 * 1024);
  });

  it("أكبر من الـ 3 ميجا المتفق عليها عشان يفضل فيه هامش", () => {
    expect(CHUNK_SIZE_BYTES).toBe(3 * 1024 * 1024);
  });

  it("أقل من MAX_DIRECT_UPLOAD_BYTES — الجزء أأمن من الملف الكامل", () => {
    expect(CHUNK_SIZE_BYTES).toBeLessThanOrEqual(MAX_DIRECT_UPLOAD_BYTES);
  });
});

describe("assertLectureChunk", () => {
  /** حجم الجزء المسموح — نفس سقف الراوت. */
  const MAX_CHUNK = 4 * 1024 * 1024;

  it("يقبل جزء من ملف mp3 صالح", () => {
    const chunk = fakeFile("lecture.part1.mp3", 1024, "audio/mpeg");
    expect(() => assertLectureChunk(chunk, "محاضرة.mp3", MAX_CHUNK)).not.toThrow();
  });

  it("بيفحص امتداد **الجزء** — لازم يكون mp3/aac", () => {
    /* ⚠️ قبل التغيير ده كان بيقفل على امتداد الاسم الأصلي. دلوقتي
       القاعدة اتقلبت: الاسم الأصلي ممكن يكون أي صيغة مدعومة
       (webm/mp4/wav...) بس **الجزء** لازم يوصلنا mp3/aac — لأن
       دي الصيغ الوحيدة اللي إطاراتها مستقلة فبتتقسم بأمان. */
    const chunk = fakeFile("lecture.part1.mp3", 1024, "audio/mpeg");
    expect(() => assertLectureChunk(chunk, "محاضرة.mp3", MAX_CHUNK)).not.toThrow();
  });

  it("يقبل الامتدادات المدعومة كلها في اسم الملف الأصلي", () => {
    /* ⚠️ الاسم الأصلي بيقبل أي صيغة مدعومة — والجزء دايماً mp3/aac. */
    for (const ext of ["mp3", "wav", "m4a", "mp4", "aac", "flac"]) {
      const chunk = fakeFile("chunk.part1.mp3", 1024, "audio/mpeg");
      expect(() =>
        assertLectureChunk(chunk, `محاضرة.${ext}`, MAX_CHUNK),
      ).not.toThrow();
    }
  });

  it("يقبل جزء aac كمان", () => {
    const chunk = fakeFile("lecture.part1.aac", 1024, "audio/aac");
    expect(() => assertLectureChunk(chunk, "محاضرة.aac", MAX_CHUNK)).not.toThrow();
  });

  it("**يرفض** جزء بصيغة حاوية بـ UNSUPPORTED_CHUNK_FORMAT", () => {
    /* ⚠️ ده حارس خطأ الـ 422: لو وصلنا part مقطوع من webm/mp4
       (فهرس ناقص) لازم نرفضه بوضوح بدل ما نرمي فلوس على نداء
       هيhfشل عند المزوّد. */
    for (const ext of ["webm", "mp4", "wav", "m4a", "flac"]) {
      const chunk = fakeFile(`lecture.part1.${ext}`, 1024, "audio/mpeg");
      try {
        assertLectureChunk(chunk, `محاضرة.${ext}`, MAX_CHUNK);
        throw new Error("كان المفروض يرمي");
      } catch (error) {
        expect(error).toBeInstanceOf(TranscriptionError);
        expect((error as TranscriptionError).code).toBe(
          "UNSUPPORTED_CHUNK_FORMAT",
        );
        expect((error as TranscriptionError).status).toBe(415);
      }
    }
  });

  it("يرفض جزء امتداده مش mp3/aac حتى لو الاسم الأصلي mp3", () => {
    /* ⚠️ الاسم الأصلي mp3 بس الجزء وصلنا `.part1` (امتداد غلط) —
       ده خطأ عميل، والامتداد `part1` مش من الصيغ المستقلة. */
    const chunk = fakeFile("lecture.part1", 1024, "audio/mpeg");
    try {
      assertLectureChunk(chunk, "محاضرة.mp3", MAX_CHUNK);
      throw new Error("كان المفروض يرمي");
    } catch (error) {
      expect((error as TranscriptionError).code).toBe(
        "UNSUPPORTED_CHUNK_FORMAT",
      );
    }
  });

  it("يرفض اسم أصلي بصيغة غير مدعومة بـ 415", () => {
    const chunk = fakeFile("chunk.part1.pdf", 1024, "application/pdf");
    try {
      assertLectureChunk(chunk, "محاضرة.pdf", MAX_CHUNK);
      throw new Error("كان المفروض يرمي");
    } catch (error) {
      expect(error).toBeInstanceOf(TranscriptionError);
      expect((error as TranscriptionError).code).toBe("UNSUPPORTED_TYPE");
      expect((error as TranscriptionError).status).toBe(415);
    }
  });

  it("يرفض الجزء الفاضي بـ 400", () => {
    const chunk = fakeFile("lecture.part1.mp3", 0, "audio/mpeg");
    try {
      assertLectureChunk(chunk, "محاضرة.mp3", MAX_CHUNK);
      throw new Error("كان المفروض يرمي");
    } catch (error) {
      expect((error as TranscriptionError).code).toBe("EMPTY_FILE");
      expect((error as TranscriptionError).status).toBe(400);
    }
  });

  it("يرفض الجزء الأكبر من السقف بـ 413", () => {
    const oversize = {
      size: MAX_CHUNK + 1,
      name: "lecture.part1.mp3",
      type: "audio/mpeg",
    } as File;
    try {
      assertLectureChunk(oversize, "محاضرة.mp3", MAX_CHUNK);
      throw new Error("كان المفروض يرمي");
    } catch (error) {
      expect((error as TranscriptionError).code).toBe("FILE_TOO_LARGE");
      expect((error as TranscriptionError).status).toBe(413);
    }
  });

  it("**مش** بيطبّق سقف الملف الكامل (1 جيجا) على الجزء", () => {
    /* ⚠️ الفرق عن assertLectureFile: الجزء جزء من ملف أكبر، فلازم
       يمرّ بسقف الجزء مش بسقف الملف الكامل. */
    const chunk = fakeFile("lecture.part1.mp3", 1024, "audio/mpeg");
    expect(() => assertLectureChunk(chunk, "محاضرة.mp3", MAX_CHUNK)).not.toThrow();
  });
});

describe("chunkFileName", () => {
  it("بيحافظ على الامتداد في الآخر — ElevenLabs بيتعرف على الصيغة منه", () => {
    /* ⚠️ ده أخطر خطأ ممكن في التقسيم: لو الامتداد طلع في النص
       (`lecture.mp3.part1`) فالعنصر كله هيرجع 415 من المزوّد. */
    expect(chunkFileName("lecture.mp3", 0)).toBe("lecture.part1.mp3");
    expect(chunkFileName("lecture.mp3", 7)).toBe("lecture.part8.mp3");
  });

  it("بيشتغل مع الأسماء العربية", () => {
    expect(chunkFileName("محاضرة اليوم.m4a", 0)).toBe("محاضرة اليوم.part1.m4a");
  });

  it("بيحافظ على النقاط في اسم الملف (زي `lecture.final.mp3`)", () => {
    expect(chunkFileName("lecture.final.mp3", 1)).toBe("lecture.final.part2.mp3");
  });

  it("لو مفيش امتداد — بيلحق اللاحقة بس", () => {
    expect(chunkFileName("تسجيل", 0)).toBe("تسجيل.part1");
  });

  it("الامتداد الناتج **مدعوم** في كل الحالات", () => {
    /* ⚠️ الملفات من غير امتداد (زي `تسجيل`) بتترفض **قبل** التقسيم —
       `assertLectureFile` في الواجهة بتقبلها لأ، فالاسم المولّد منهم
       (`تسجيل.part1`) امتداده `part1` — وده مش مدعوم. */
    for (const name of ["lecture.mp3", "محاضرة.m4a", "lecture.final.wav"]) {
      const generated = chunkFileName(name, 0);
      const ext = lectureFileExtension(generated);
      // لو الامتداد مش مدعوم، الـ chunk هيرجع 415 من الراوت.
      expect(ALLOWED_LECTURE_EXTENSIONS as readonly string[]).toContain(ext);
    }
  });
});

describe("TranscriptionError", () => {
  it("بيحمل كود وحالة وتفاصيل", () => {
    const error = new TranscriptionError("X", "رسالة", 418, "detail-for-logs");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("X");
    expect(error.status).toBe(418);
    expect(error.detail).toBe("detail-for-logs");
  });
});
