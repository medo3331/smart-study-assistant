import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

/* ==========================================================================
   استخراج النص من ملف مرفوع — الكود المشترك بين راوتين

   ليه اتفصل عن `app/api/analyze-file/route.ts`:
   راوت الديمو المفتوح (`/api/demo`) محتاج نفس القراءة بالظبط بس بحدود
   أصغر بكتير. نسخ الكود كان معناه إن أي إصلاح في قراءة العربي (زي
   حكاية إنجن ٢) يتعمل مرتين — والمرة التانية هتتنسي.

   الفرق الوحيد بين الاستخدامين هو **الحدود**، فالحدود بقت باراميتر
   والمنطق واحد.

   ⚠️ الملف ده مالوش أي علاقة بالمصادقة ولا بحدود الاستخدام — الراوت
   اللي بيناديه هو المسؤول عن ده. الوحدة دي بتقرا ملف وبس.
   ========================================================================== */

/** خطأ بنعرف نصه للمستخدم — أي حاجة تانية بتتحول لرسالة عامة. */
export class ExtractError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
    this.name = 'ExtractError';
  }
}

/** أقل عدد حروف نعتبره نتيجة مقبولة قبل ما نجرّب إنجن أقوى. */
const MIN_USEFUL_CHARS = 12;
/** مهلة نداء الـ OCR — من غيرها الراوت يقدر يستنى للأبد. */
const OCR_TIMEOUT_MS = 25_000;

type OcrAttempt = { engine: 1 | 3 };

export type FileKind = 'pdf' | 'docx' | 'image' | 'text';

/** بيحدد نوع الملف من الـ MIME والامتداد، أو null لو مش مدعوم. */
export function detectFileKind(fileType: string, fileName: string): FileKind | null {
  const lower = fileName.toLowerCase();

  if (fileType === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';

  if (
    fileType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    return 'docx';
  }

  if (fileType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/.test(lower)) {
    return 'image';
  }

  if (
    ['text/plain', 'text/markdown', 'text/csv', 'application/json'].includes(fileType) ||
    /\.(txt|md|csv|json)$/.test(lower)
  ) {
    return 'text';
  }

  return null;
}

/**
 * ينادي ocr.space مرة واحدة بإنجن محدد ويرجّع النص.
 *
 * ⚠️ أهم حاجة هنا: **إنجن ٢ مش بيدعم العربي خالص.** الكود القديم كان
 * بيبعت `OCREngine=2` مع `language=ara`، وocr.space بيتجاهل الـ language
 * بالكامل من غير أي خطأ ويرجّع حروف لاتينية مخربطة أو نص فاضي — وده
 * اللي كان بيوصل للمستخدم كرسالة "مقدرتش أقرا الصورة" وهو الصورة سليمة.
 * العربي موجود على إنجن ١ (أسرع، كوتة ٢٥ ألف) وإنجن ٣ (أدق وبيقرا خط
 * اليد، بس أبطأ وكوتته منفصلة ٢٥٠٠).
 */
async function callOcrSpace(
  apiKey: string,
  buffer: Uint8Array,
  fileName: string,
  mimeType: string,
  { engine }: OcrAttempt
): Promise<string> {
  const form = new FormData();
  // النوع لازم يتمرر مع الـ Blob — Blob من غير type بيوصلهم
  // كـ application/octet-stream فيرجّع "Unable to recognize the file type"
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);
  form.append('OCREngine', String(engine));
  // إنجن ٣ بياخد auto بس، وإنجن ١ محتاج كود اللغة صريح
  form.append('isOverlayRequired', 'false');
  form.append('scale', 'true');
  form.append('detectOrientation', 'true');

  let response: Response;
  try {
    response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { apikey: apiKey },
      body: form,
      signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    console.error('OCR fetch failed:', err);
    throw new ExtractError(
      timedOut
        ? 'قراءة الصورة خدت وقت طويل. جرّب صورة أصغر أو أوضح.'
        : 'مقدرتش أوصل لخدمة قراءة الصور. جرّب تاني بعد شوية.',
      timedOut ? 504 : 502
    );
  }

  // الكود القديم كان بيعمل response.json() على طول — لو رجع 403 أو
  // صفحة HTML كان بيرمي SyntaxError ويطلع للمستخدم كـ ٥٠٠ مبهمة
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('OCR HTTP error:', response.status, detail.slice(0, 300));
    throw new ExtractError(
      response.status === 403
        ? 'مفتاح خدمة قراءة الصور مرفوض. لازم يتراجع.'
        : 'خدمة قراءة الصور مش متاحة دلوقتي. جرّب تاني بعد شوية.',
      502
    );
  }

  const result = await response.json().catch(() => null);
  if (!result || typeof result !== 'object') {
    throw new ExtractError('رد غير مفهوم من خدمة قراءة الصور.', 502);
  }

  // ErrorMessage بييجي مرة string ومرة array على حسب نوع الفشل
  const rawError = (result as { ErrorMessage?: unknown }).ErrorMessage;
  const errorText = Array.isArray(rawError)
    ? rawError.join(' | ')
    : typeof rawError === 'string'
      ? rawError
      : '';

  if ((result as { IsErroredOnProcessing?: boolean }).IsErroredOnProcessing) {
    console.error('OCR processing error:', errorText || result);
    // الكوتة والمفتاح بيرجعوا جوه ErrorMessage مش كـ HTTP status
    if (/E550|invalid.*api key/i.test(errorText)) {
      throw new ExtractError('مفتاح خدمة قراءة الصور غير صالح.', 502);
    }
    if (/limit|quota|exceed/i.test(errorText)) {
      throw new ExtractError(
        'خدمة قراءة الصور وصلت حدها اليومي. جرّب بكرة أو ابعت الملف كنص.',
        429
      );
    }
    throw new ExtractError('مقدرتش أقرا الصورة. جرّب صورة أوضح.');
  }

  // ParsedResults بييجي null في بعض حالات الفشل و [] في التايم أوت
  const parsed = (result as { ParsedResults?: unknown }).ParsedResults;
  if (!Array.isArray(parsed) || parsed.length === 0) return '';

  // بناخد كل الصفحات مش أول واحدة بس — PDF مصوّر بيرجّع نتيجة لكل صفحة
  return parsed
    .map((page) => {
      const text = (page as { ParsedText?: unknown }).ParsedText;
      return typeof text === 'string' ? text : '';
    })
    .join('\n\n')
    .trim();
}

/**
 * بيجرّب إنجن ١ بالعربي الأول (سريع وكوتته كبيرة)، ولو رجع لا شيء
 * أو نص تافه بيرقّي لإنجن ٣ (بيقرا خط اليد و٢٠٠+ لغة).
 * كده الحالة الشائعة بتفضل رخيصة والصور الصعبة لسه بتشتغل.
 */
async function extractTextFromImage(
  apiKey: string,
  buffer: Uint8Array,
  fileName: string,
  mimeType: string
): Promise<string> {
  const attempts: OcrAttempt[] = [{ engine: 1 }, { engine: 3 }];

  let lastError: ExtractError | null = null;
  // أحسن نص لقيناه لحد دلوقتي — نص قصير أفيد للمستخدم من رسالة خطأ
  let bestText = '';

  for (const attempt of attempts) {
    try {
      const text = await callOcrSpace(apiKey, buffer, fileName, mimeType, attempt);
      if (text.replace(/\s/g, '').length >= MIN_USEFUL_CHARS) return text;
      // نص قصير من إنجن ١ = يستاهل نجرّب الأقوى قبل ما نستسلم
      if (text.trim().length > bestText.length) bestText = text.trim();
    } catch (err) {
      if (err instanceof ExtractError) {
        lastError = err;
        // مفتاح غلط أو كوتة خلصت: تكرار المحاولة مش هيفيد.
        // بس لو معانا نص من محاولة قبلها منرميهوش — أي نص أفيد من رسالة خطأ
        if (err.status === 502 || err.status === 429) {
          if (bestText) return bestText;
          throw err;
        }
      } else {
        console.error('OCR attempt failed:', err);
        lastError = new ExtractError('مقدرتش أقرا الصورة. جرّب صورة أوضح.');
      }
    }
  }

  if (bestText) return bestText;
  if (lastError) throw lastError;
  return '';
}

export type ExtractOptions = {
  /** أقصى حجم للملفات اللي بتتحلل محلياً (PDF/Word/نص). */
  maxFileBytes: number;
  /**
   * أقصى حجم للصور — أقل بكتير لأن الخطة المجانية في ocr.space بترفض
   * أي صورة أكبر من ١ ميجا **عن طريق الـ API** (الـ ٥ ميجا المكتوبة على
   * موقعهم بتاعة الرفع اليدوي من المتصفح).
   */
  maxImageBytes: number;
  /** أقصى طول نص بنرجّعه. */
  maxTextChars: number;
};

/**
 * بيقرا ملف مرفوع ويرجّع نصه. بيرمي `ExtractError` برسالة عربية
 * مفهومة للمستخدم في كل حالات الفشل المتوقّعة.
 */
export async function extractTextFromFile(
  file: File,
  options: ExtractOptions
): Promise<string> {
  if (file.size === 0) {
    throw new ExtractError('الملف فاضي.', 400);
  }

  // النوع الأول، وبعدين البافر — مش العكس. قراءة ٨ ميجا في الذاكرة
  // عشان نكتشف بعدها إن النوع مش مدعوم هدر.
  const kind = detectFileKind(file.type, file.name);
  if (!kind) {
    throw new ExtractError('نوع الملف غير مدعوم حالياً', 415);
  }

  const sizeLimit = kind === 'image' ? options.maxImageBytes : options.maxFileBytes;
  if (file.size > sizeLimit) {
    const mb = Math.round((sizeLimit / (1024 * 1024)) * 10) / 10;
    throw new ExtractError(
      kind === 'image'
        ? `الصورة كبيرة على خدمة القراءة (الحد ${mb} ميجا). صغّرها أو خد سكرين شوت للجزء المهم بس.`
        : `الملف كبير جداً. أقصى حجم مسموح ${mb} ميجا.`,
      413
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  let text = '';

  if (kind === 'pdf') {
    // PDF مكسور أو محمي بباسورد بيرمي من جوه unpdf — ده خطأ متوقّع
    // مش كراش، فلازم يوصل للمستخدم كرسالة مفهومة.
    try {
      const pdf = await getDocumentProxy(buffer);
      const extracted = await extractText(pdf, { mergePages: true });
      text = extracted.text;
    } catch (err) {
      console.error('PDF parse failed:', err);
      throw new ExtractError(
        'مقدرتش أفتح ملف الـ PDF ده. لو محمي بباسورد شيل الحماية وجرّب تاني.',
        422
      );
    }
  } else if (kind === 'docx') {
    try {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      text = result.value;
    } catch (err) {
      console.error('DOCX parse failed:', err);
      throw new ExtractError('مقدرتش أقرا ملف الـ Word ده. جرّب تحفظه تاني.', 422);
    }
  } else if (kind === 'image') {
    const apiKey = process.env.OCR_SPACE_API_KEY?.trim();
    // مفتاح OCR ناقص = خطأ صريح، مش طلب مجهول بيفشل بصمت
    if (!apiKey) {
      console.error('extract-text: OCR_SPACE_API_KEY غير معرف');
      throw new ExtractError('تحليل الصور غير متاح حالياً.', 503);
    }

    // النوع اللي بنبعته لـ ocr.space: لو المتصفح مبعتش type
    // بنستنتجه من الامتداد بدل ما نبعت octet-stream
    const ext = file.name.toLowerCase().split('.').pop() || '';
    const safeMime = file.type.startsWith('image/')
      ? file.type
      : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    text = await extractTextFromImage(apiKey, buffer, file.name, safeMime);
  } else {
    text = Buffer.from(buffer).toString('utf-8');
  }

  if (!text.trim()) {
    throw new ExtractError(
      kind === 'image'
        ? 'مفيش نص واضح في الصورة. اتأكد إنها مش مقلوبة والكتابة باينة.'
        : 'مفيش نص اتقرا من الملف ده.',
      422
    );
  }

  return text.slice(0, options.maxTextChars);
}
