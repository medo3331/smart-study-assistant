/**
 * خيارات الاسترداد بعد فشل تجهيز/رفع/تفريغ المحاضرة — منطق خالص بلا React.
 * ══════════════════════════════════════════════════════════════════════
 *
 * ⚠️ القواعد (غير قابلة للتفاوض):
 *  - لا يُرفع الملف الأصلي تلقائيًا أبدًا — الطالب هو اللي يختار.
 *  - إعادة الضغط محدودة بعدد صريح (`MAX_MANUAL_RETRIES`) وبضغطة
 *    المستخدم فقط — مافيش حلقات ولا عمليات خلفية مكلفة.
 *  - لا يُبدأ أي تقسيم تلقائيًا: التقسيم الآمن مسار غير موجود حاليًا،
 *    فالخيار يعرض تعليمات واضحة بدل زر وهمي.
 *  - لا ادعاء حفظ/رفع لم يحدث، ولا حذف لملف المستخدم من جهازه.
 *  - لا تُسجَّل أسماء ملفات ولا روابط موقعة ولا أسرار — الأكواد ثابتة
 *    ومُعرَّفة هنا، ومطابِقة لأكواد `failCode` في `LectureTranscriber`.
 */

/** مرحلة الفشل: تجهيز (قبل الرفع) / رفع / تفريغ (بعد اكتمال الرفع). */
export type FailureStage = "prepare" | "upload" | "transcribe";

/** زر/رابط واحد داخل بطاقة الاسترداد. `action` يُقرأها المكوّن وينفّذها. */
export type RecoveryAction = "retry-prepare" | "pick-smaller" | "split-guide" | "paste-text";

/** خيار واحد معروض في بطاقة الاسترداد. */
export type RecoveryOption = {
  action: RecoveryAction;
  /** عنوان الزر — نص عربي ثابت، بلا أي بيانات مستخدم. */
  label: string;
  /** سطر شرح واحد تحت العنوان. */
  detail: string;
  /** زر أساسي واحد بس في البطاقة (`true` = إعادة المحاولة اليدوية). */
  primary?: boolean;
};

/** الحد الأقصى لإعادات التجهيز اليدوية — بعدها تختفي إعادة المحاولة. */
export const MAX_MANUAL_RETRIES = 3;

/**
 * يحدّد مرحلة الفشل من كود `failCode` الثابت.
 * ⚠️ أي كود غير معروف يُعامَل كفشل تجهيز (الأكثر أمانًا: بلا رفع تلقائي).
 */
export function stageFromCode(code: string): FailureStage {
  if (code.startsWith("upload.") || code === "ticket.http" || code === "ticket.invalid" || code === "net.run") {
    return "upload";
  }
  if (code.startsWith("transcribe.")) {
    return "transcribe";
  }
  return "prepare";
}

/**
 * عنوان البطاقة حسب المرحلة — نص ثابت بلا بيانات مستخدم.
 */
export function recoveryTitle(stage: FailureStage): string {
  if (stage === "upload") return "الرفع ما اكتملش — محاضرتك لسه عندك";
  if (stage === "transcribe") return "التفريغ ما اكتملش — ملفك المرفوع محفوظ";
  return "هنساعدك تجهّز محاضرتك";
}

/**
 * سطر الوصف حسب المرحلة — يوضّح ما حدث فعلًا بلا ادعاء حفظ/رفع.
 */
export function recoveryBlurb(stage: FailureStage): string {
  if (stage === "upload") {
    return "الرفع اتقطع قبل ما يخلص، فمافيش ملف كامل على الخادم. تقدر تدوس «تحويل إلى نص» تاني وهيبدأ الرفع من جديد، أو تختار ملفًا أصغر.";
  }
  if (stage === "transcribe") {
    return "الملف اترفع كامل، لكن التحويل إلى نص ما اكتملش. ملفك المرفوع لسه متسجّل — دوس «حاول تحويلها تاني» وهيكمّل من غير رفع جديد.";
  }
  return "الملف أكبر أو أصعب في المعالجة من المتوقع، ومقدرناش نجهّزه بالطريقة الأولى. محاضرتك الأصلية لم يتم رفعها.";
}

/**
 * الخيارات المعروضة حسب المرحلة وعدد محاولات التجهيز السابقة.
 *
 * - `prepare`: إعادة يدوية (تختفي بعد `MAX_MANUAL_RETRIES`) + ملف أصغر
 *   + تعليمات تقسيم + رابط النص الجاهز.
 * - `upload`: ملف أصغر فقط — زر «تحويل إلى نص» الرئيسي أصلًا بيعيد
 *   التدفق كاملًا (تذكرة + رفع)، فمافيش داعي لزر مكرر؛ والأهم إن
 *   إعادة التفريغ على مسار لم يكتمل رفعه هتفشل حتمًا.
 * - `transcribe`: لا شيء جديد — زر «حاول تحويلها تاني» الموجود أصلًا
 *   هو الحل؛ البطاقة لا تظهر لهذه المرحلة.
 */
export function recoveryOptions(stage: FailureStage, prepareAttempts: number): RecoveryOption[] {
  if (stage === "upload") {
    return [
      {
        action: "pick-smaller",
        label: "اختار ملفًا صوتيًا أصغر",
        detail: "نسخة أخف، أو صوت بدل الفيديو — بيعدّي أسرع وأضمن.",
      },
    ];
  }
  if (stage === "transcribe") {
    return [];
  }
  const options: RecoveryOption[] = [];
  if (prepareAttempts < MAX_MANUAL_RETRIES) {
    options.push({
      action: "retry-prepare",
      label: "جرّب تجهيز الملف مرة أخرى",
      detail: `محاولة يدوية واحدة في كل مرة (باقي ${MAX_MANUAL_RETRIES - prepareAttempts}).`,
      primary: true,
    });
  }
  options.push(
    {
      action: "pick-smaller",
      label: "اختار ملفًا صوتيًا أصغر",
      detail: "تقدر تختار نسخة أخف أو ملفًا صوتيًا بدل الفيديو.",
    },
    {
      action: "split-guide",
      label: "قسّم المحاضرة إلى أجزاء",
      detail: "التقسيم الآمن لسه غير متاح تلقائيًا — قسّمها بنفسك كل 10–15 دقيقة وفرّغ كل جزء لوحده.",
    },
    {
      action: "paste-text",
      label: "عندي نص المحاضرة بالفعل",
      detail: "لو معاك تفريغ سابق، كمّل بيه في أدوات التلخيص والشرح.",
    },
  );
  return options;
}

/**
 * هل مرحلة الفشل تستحق بطاقة استرداد أصلًا؟
 * ⚠️ فشل التفريغ له زرّه الخاص («حاول تحويلها تاني») — البطاقة للتجهيز والرفع فقط.
 */
export function needsRecoveryCard(stage: FailureStage): boolean {
  return stage === "prepare" || stage === "upload";
}
