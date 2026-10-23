/**
 * اختبارات بطاقة الاسترداد — منطق خالص بلا React.
 * ══════════════════════════════════════════════════════════════════════
 *
 * ⚠️ المشروع بلا مكتبة اختبار واجهات (testing-library/jsdom) — فالدوال
 * هنا هي «عقل» البطاقة: انتقالات المراحل حسب الكود، والخيارات المعروضة
 * حسب المحاولات، والحد الأقصى اليدوي. الزراير نفسها مربوطة بإجراءات
 * حقيقية مذكورة بالاسم في تعليقات `handleRecovery` بالمكوّن، ومتحقق
 * منها يدويًا مع التقرير.
 */
import { describe, it, expect } from "vitest";
import {
  MAX_MANUAL_RETRIES,
  needsRecoveryCard,
  recoveryBlurb,
  recoveryOptions,
  recoveryTitle,
  stageFromCode,
  type RecoveryAction,
} from "../lecture-recovery";

const ACTIONS = (stage: "prepare" | "upload" | "transcribe", attempts: number): RecoveryAction[] =>
  recoveryOptions(stage, attempts).map((o) => o.action);

describe("المرحلة — تُشتق من كود failCode الثابت", () => {
  it("✅ أكواد التجهيز (prep.* / file.* / storage.*) → مرحلة تجهيز", () => {
    for (const code of ["prep.other", "prep.duration", "prep.media", "prep.exec", "prep.too_long", "file.invalid", "storage.disabled"]) {
      expect(stageFromCode(code)).toBe("prepare");
    }
  });

  it("✅ أكواد الرفع (upload.* / ticket.* / net.run) → مرحلة رفع", () => {
    for (const code of ["upload.xhr", "ticket.http", "ticket.invalid", "net.run"]) {
      expect(stageFromCode(code)).toBe("upload");
    }
  });

  it("✅ أكواد التفريغ (transcribe.*) → مرحلة تفريغ", () => {
    for (const code of ["transcribe.http", "transcribe.bad_response"]) {
      expect(stageFromCode(code)).toBe("transcribe");
    }
  });

  it("✅ كود مجهول → تجهيز (الأكثر أمانًا: بلا رفع تلقائي)", () => {
    expect(stageFromCode("something-new")).toBe("prepare");
    expect(stageFromCode("")).toBe("prepare");
  });
});

describe("البطاقة — متى تظهر وبأي عنوان", () => {
  it("✅ تظهر للتجهيز والرفع فقط — لا للتفريغ (له زرّه الخاص)", () => {
    expect(needsRecoveryCard("prepare")).toBe(true);
    expect(needsRecoveryCard("upload")).toBe(true);
    expect(needsRecoveryCard("transcribe")).toBe(false);
  });

  it("✅ العناوين والوصف نصوص ثابتة بلا بيانات مستخدم", () => {
    expect(recoveryTitle("prepare")).toBe("هنساعدك تجهّز محاضرتك");
    expect(recoveryTitle("upload")).toContain("محاضرتك لسه عندك");
    expect(recoveryBlurb("prepare")).toContain("لم يتم رفعها");
    expect(recoveryBlurb("upload")).not.toContain("تم رفع");
    expect(recoveryBlurb("transcribe")).toContain("اترفع كامل");
  });
});

describe("خيارات التجهيز — يدوية محدودة + بدائل حقيقية", () => {
  it("✅ أول فشل: إعادة يدوية (أساسية) + ملف أصغر + تقسيم + نص جاهز", () => {
    expect(ACTIONS("prepare", 1)).toEqual(["retry-prepare", "pick-smaller", "split-guide", "paste-text"]);
  });

  it("✅ بعد استنفاد المحاولات: إعادة المحاولة تختفي ولا حلقات", () => {
    expect(ACTIONS("prepare", MAX_MANUAL_RETRIES)).toEqual(["pick-smaller", "split-guide", "paste-text"]);
    expect(ACTIONS("prepare", MAX_MANUAL_RETRIES + 5)).toEqual(["pick-smaller", "split-guide", "paste-text"]);
  });

  it("✅ التقسيم تعليمات فقط — لا زر وهمي", () => {
    const split = recoveryOptions("prepare", 1).find((o) => o.action === "split-guide")!;
    expect(split.detail).toContain("غير متاح تلقائيًا");
  });

  it("✅ النص الجاهز موجود كخيار رابط — لا يُبنى محرر جديد", () => {
    const paste = recoveryOptions("prepare", 1).find((o) => o.action === "paste-text")!;
    expect(paste.label).toContain("عندي نص المحاضرة");
  });
});

describe("خيارات الرفع — لا إعادة ضغط ولا تفريغ على مسار ناقص", () => {
  it("✅ ملف أصغر فقط — زر التحويل الرئيسي أصلًا بيعيد التدفق", () => {
    expect(ACTIONS("upload", 0)).toEqual(["pick-smaller"]);
  });

  it("✅ التفريغ لا خيارات جديدة له — زرّه الموجود هو الحل", () => {
    expect(ACTIONS("transcribe", 0)).toEqual([]);
  });
});

describe("السلامة — لا رفع تلقائي ولا أسرار", () => {
  it("✅ النصوص كلها ثابتة: لا أسماء ملفات ولا روابط ولا توكنات", () => {
    const forbidden = [/https?:\/\//, /token/i, /signedUrl/, /\.mp3|\.mp4/, /[0-9]{2,}MB/];
    for (const stage of ["prepare", "upload", "transcribe"] as const) {
      for (const text of [recoveryTitle(stage), recoveryBlurb(stage)]) {
        for (const pattern of forbidden) expect(text).not.toMatch(pattern);
      }
      for (const option of recoveryOptions(stage, 1)) {
        for (const text of [option.label, option.detail]) {
          for (const pattern of forbidden) expect(text).not.toMatch(pattern);
        }
      }
    }
  });

  it("✅ حد المحاولات اليدوية رقم صريح صغير", () => {
    expect(MAX_MANUAL_RETRIES).toBeGreaterThan(0);
    expect(MAX_MANUAL_RETRIES).toBeLessThanOrEqual(5);
  });
});
