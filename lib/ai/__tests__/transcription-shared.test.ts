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
  assertLectureFile,
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

describe("TranscriptionError", () => {
  it("بيحمل كود وحالة وتفاصيل", () => {
    const error = new TranscriptionError("X", "رسالة", 418, "detail-for-logs");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("X");
    expect(error.status).toBe(418);
    expect(error.detail).toBe("detail-for-logs");
  });
});
