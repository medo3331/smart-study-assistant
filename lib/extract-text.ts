import mammoth from 'mammoth';
import { extractText, getDocumentProxy, renderPageAsImage } from 'unpdf';
// ⚠️ استخراج PPTX — `jszip` (من `docx`/`mammoth`/`pptxgenjs`) و`xmldom`
//    (من `mammoth`). الاتنين **مش direct** في package.json — بس جايين من
//    deps مباشرة موجودة، فمستقرة. (تفصيل في `extractPptxSlides`.)
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
// PDF parsing is intentionally loaded dynamically inside extractTextFromFile so
// ordinary chat requests never evaluate pdfjs-dist (which requires browser
// globals such as DOMMatrix in Node.js).

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
  code: string;
  constructor(message: string, status = 422, code = 'EXTRACTION_FAILED') {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ExtractError';
  }
}

/** أقل عدد حروف نعتبره نتيجة مقبولة قبل ما نجرّب إنجن أقوى. */
const MIN_USEFUL_CHARS = 12;
/** مهلة نداء الـ OCR — من غيرها الراوت يقدر يستنى للأبد. */
const OCR_TIMEOUT_MS = 25_000;
/**
 * ⚠️ **عدد صفحات PDF اللي بتتقرا بالـ OCR**.
 *
 * سطر واحد في المستند (مفيش text layer) ⇒ **كل** الصفحات محتاجة OCR.
 * بس كل صفحة = نداء ocr.space بـ ٢٥ ثانية timeout ⇒ ٤٨ صفحة = ٢٠ دقيقة.
 *
 * ⇒ سقف ٦ صفحات (١٥٠ ثانية أسوأ حالة) + الباقي بيتعلّم `empty: true`
 *   ⇒ الـ UI يصرّح للطالب بالصفحات اللي متقرتش (مش نعمل كذب).
 *
 * (الحد كان ٣ — اترفع لـ ٦ مع العروض التقديمية. مسجّل في
 * `docs/TECH_DEBT.md` N-013: الحل الدائم OCR محلي بـ tesseract.js.)
 */
const MAX_OCR_PDF_PAGES = 6;

type OcrAttempt = { engine: 1 | 3 };

export type FileKind = 'pdf' | 'pptx' | 'docx' | 'image' | 'text';

/**
 * ⚠️ **نوع الوحدة اللي بنعدّ بيها** — بيختلف حسب نوع الملف:
 *   pdf  → صفحة
 *   pptx → شريحة
 *   docx → فقرة (الـ DOCX مالوش صفحات ثابتة — الـ page count ناتج
 *          rendering مش data، فالمرجع الصحيح هو الفقرة)
 *   نص/صورة → وحدة واحدة
 */
export type DocumentUnitKind = 'page' | 'slide' | 'paragraph';

/** وحدة واحدة (صفحة/شريحة/فقرة) بنصّها. */
export type ExtractedPage = {
  /** 0-based — الداخلي. */
  index: number;
  /** 1-based — اللي بنعرضه للطالب («صفحة ٤»). */
  number: number;
  text: string;
  kind: DocumentUnitKind;
  /** اتقرا بالـ OCR (مش نص مدمج). */
  viaOcr: boolean;
  /** مفيش نص خالص (صفحة مصوّرة اتخطّت بسبب السقف). */
  empty: boolean;
};

/** المستند بعد الاستخراج: النص المدمج + الوحدات مقصوصة وحدة وحدة. */
export type ExtractedDocument = {
  /** النص المدمج — مطابق لسلوك `extractTextFromFile` القديم. */
  text: string;
  pages: ExtractedPage[];
  pageCount: number;
  kind: FileKind;
  /** أرقام الوحدات اللي متقرتش (1-based) — عشان الـ UI يصرّح. */
  unread: number[];
};

/** بيحدد نوع الملف من الـ MIME والامتداد، أو null لو مش مدعوم. */
export function detectFileKind(fileType: string, fileName: string): FileKind | null {
  const lower = fileName.toLowerCase();

  if (fileType === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';

  // ⚠️ PPTX — كان مش مدعوم خالص (مافيش ingestion للـ pptx في المشروع).
  //    الـ MIME الرسمي + الامتداد (المتصفحات بيبعتوا أنواع تانية أحياناً).
  if (
    fileType ===
      'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    lower.endsWith('.pptx')
  ) {
    return 'pptx';
  }

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
      timedOut ? 504 : 502,
      timedOut ? 'OCR_TIMEOUT' : 'OCR_UPSTREAM_FAILED'
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
      502,
      'OCR_UPSTREAM_FAILED'
    );
  }

  const result = await response.json().catch(() => null);
  if (!result || typeof result !== 'object') {
    throw new ExtractError('رد غير مفهوم من خدمة قراءة الصور.', 502, 'OCR_BAD_RESPONSE');
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
      throw new ExtractError('مفتاح خدمة قراءة الصور غير صالح.', 502, 'OCR_AUTH_FAILED');
    }
    if (/limit|quota|exceed/i.test(errorText)) {
      throw new ExtractError(
        'خدمة قراءة الصور وصلت حدها اليومي. جرّب بكرة أو ابعت الملف كنص.',
        429
      );
    }
    throw new ExtractError('مقدرتش أقرا الصورة. جرّب صورة أوضح.', 422, 'IMAGE_NO_TEXT');
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

/* ═══════════════════════════ استخراج PPTX ═══════════════════════════ */

/**
 * ⚠️ **ليه `jszip` + `xmldom` مش `officeparser`**:
 *   `officeparser` بيطلع **نص واحد مدمج** — واحنا محتاجين **حدود
 *   الشرائح بالظبط** (كل شريحة = مرجع/anchor). بنقرا الـ OOXML مباشرة:
 *   `ppt/slides/slideN.xml` فيه نصوص الشريحة في `<a:t>`.
 *
 *   ومكافأة: `ppt/notesSlides/notesSlideN.xml` فيه **ملاحظات المُقدِّم
 *   الأصلية** ⇒ نقدر نستخدمها كمصدر إضافي.
 *
 *   ⚠️ **التبعيات مش direct**: `jszip` جاية من `docx`/`mammoth`/`pptxgenjs`
 *   (كلهم direct) و`@xmldom/xmldom` من `mammoth` (direct). فمستقرة طول
 *   ما الـ deps المباشرة موجودة. (لو هنضيفهم لـ package.json، محتاجين
 *   نعملها في نفس الـ PR بتاع ترقية Next عشان ما نعملش تعارض.)
 */

/** رقم الشريحة من اسم الملف — للترتيب الرقمي (مش الأبجدي). */
function slideNumberFromPath(path: string): number {
  const match = /slide(\d+)\.xml$/i.exec(path);
  return match ? Number(match[1]) : 0;
}

/** يقرا نصوص `<a:t>` من XML بتاع DrawingML. */
function readDrawingText(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const all = doc.getElementsByTagName("*");
  const parts: string[] = [];
  for (let i = 0; i < all.length; i++) {
    const el = all[i] as unknown as {
      localName?: string;
      namespaceURI?: string;
      textContent?: string;
    };
    // ⚠️ `a:t` بس — الـ namespace بيمنع أي عنصر تاني اسمه `t`.
    if (el.localName !== "t") continue;
    if (!el.namespaceURI || !el.namespaceURI.includes("drawingml")) continue;
    const text = (el.textContent ?? "").trim();
    if (text) parts.push(text);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * يستخرج شرائح العرض (نص + ملاحظات) من ملف PPTX.
 *
 * ⚠️ **ترتيب الشرائح رقمي مش أبجدي**: `slide10.xml` لازم تيجي بعد
 *    `slide2.xml` — الترتيب الأبجدي بيرتّب ١٠ قبل ٢ وبيدمّر التسلسل.
 */
async function extractPptxSlides(
  buffer: ArrayBuffer
): Promise<Array<{ text: string; notes: string }>> {
  const zip = await JSZip.loadAsync(buffer);

  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => slideNumberFromPath(a) - slideNumberFromPath(b));

  const slides: Array<{ text: string; notes: string }> = [];

  for (const slidePath of slidePaths) {
    const entry = zip.file(slidePath);
    if (!entry) continue;

    const xml = await entry.async("text");
    const text = readDrawingText(xml);

    // ⚠️ **الـ notes مرتبطة بالـ slide عن طريق الـ rels** — الترقيم
    //    `notesSlideN` مش مضمون يطابق `slideN`.
    let notes = "";
    try {
      const relsPath = slidePath.replace(
        /slides\/(slide\d+\.xml)$/i,
        "slides/_rels/$1.rels"
      );
      const relsEntry = zip.file(relsPath);
      if (relsEntry) {
        const relsXml = await relsEntry.async("text");
        const relsDoc = new DOMParser().parseFromString(relsXml, "text/xml");
        const rels = relsDoc.getElementsByTagName("Relationship");
        for (let i = 0; i < rels.length; i++) {
          const rel = rels[i] as unknown as {
            getAttribute?: (n: string) => string | null;
          };
          const type = rel.getAttribute?.("Type") ?? "";
          if (!type.endsWith("/notesSlide")) continue;
          const target = rel.getAttribute?.("Target") ?? "";
          // ⚠️ الـ Target نسبي لجوه `ppt/slides/` ⇒ نطبّعه.
          const notesPath = target.startsWith("/")
            ? target.slice(1)
            : `ppt/slides/${target.replace(/^\.\//, "")}`.replace("slides/../", "");
          const notesEntry = zip.file(notesPath);
          if (!notesEntry) continue;
          notes = readDrawingText(await notesEntry.async("text"));
          break;
        }
      }
    } catch (err) {
      // ⚠️ الـ notes مش حرجة — لو مانعرفش نجيبها، نمشي كمان.
      console.error("pptx notes read failed:", err);
    }

    slides.push({ text, notes });
  }

  return slides;
}

/* ═══════════════════════════ استخراج المستند ═══════════════════════════ */

/**
 * بيقرا ملف مرفوع وبيحوّله لـ **وحدات** (صفحات/شرائح/فقرات).
 *
 * ⚠️ **ليه دالة جديدة مش تعديل على `extractTextFromFile`**: الـ function
 *    القديمة بترجّع `string` وليها ٤+ مستهلكين (راوت الـ analyze-file،
 *    راوت الديمو، مرفقات الشات، صفحة الـ workspace). تغيير الـ return
 *    type = كسر ٤ مواضع. ⇒ `extractTextFromFile` بقى غلاف رقيق على
 *    `extractDocument` فسلوكه ما بيتغيرش **حرفياً**.
 */
export async function extractDocument(
  file: File,
  options: ExtractOptions
): Promise<ExtractedDocument> {
  if (file.size === 0) {
    throw new ExtractError('الملف فاضي.', 400, 'FILE_EMPTY');
  }

  // النوع الأول، وبعدين البافر — مش العكس. قراءة ٨ ميجا في الذاكرة
  // عشان نكتشف بعدها إن النوع مش مدعوم هدر.
  const kind = detectFileKind(file.type, file.name);
  if (!kind) {
    throw new ExtractError('نوع الملف غير مدعوم حالياً', 415, 'UNSUPPORTED_FILE_TYPE');
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
  let pages: ExtractedPage[] = [];
  let text = '';

  if (kind === 'pdf') {
    // PDF مكسور أو محمي بباسورد بيرمي من جوه pdf-parse — ده خطأ متوقّع
    // مش كراش، فلازم يوصل للمستخدم كرسالة مفهومة.
    let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
    try {
      pdf = await getDocumentProxy(buffer);
    } catch (err) {
      console.error('PDF parse failed:', err);
      throw new ExtractError(
        'مقدرتش أفتح ملف الـ PDF ده. لو محمي بباسورد شيل الحماية وجرّب تاني.',
        422,
        'PDF_PARSE_FAILED'
      );
    }

    // ⚠️ **`mergePages: false`** — الـ overload التاني بتاع `unpdf`
    //    بيرجّع `text: string[]` (نص لكل صفحة) بدل نص مدمج. ده اللي
    //    بيخلّي نقدر نشتغل بالصفحات من غير أي مكتبة تانية.
    let pageTexts: string[] = [];
    try {
      const extracted = await extractText(pdf, { mergePages: false });
      pageTexts = Array.isArray(extracted.text) ? extracted.text : [];
    } catch (err) {
      console.error('PDF text extraction failed:', err);
      throw new ExtractError(
        'مقدرتش أفتح ملف الـ PDF ده. لو محمي بباسورد شيل الحماية وجرّب تاني.',
        422,
        'PDF_PARSE_FAILED'
      );
    }

    // ⚠️ **الـ OCR للصفحات الفاضية بس** (مش للملف كله): ملف نصّه مدمج
    //    بس نصوّر بعد ⇒ الصفحات دي هي اللي محتاجة OCR.
    const apiKey = process.env.OCR_SPACE_API_KEY?.trim();
    let ocrBudget = MAX_OCR_PDF_PAGES;

    pages = pageTexts.map((raw, i) => {
      const pageText = raw.trim();
      const usable = pageText.replace(/\s/g, '').length >= MIN_USEFUL_CHARS;
      if (usable) {
        return {
          index: i,
          number: i + 1,
          text: pageText,
          kind: 'page' as const,
          viaOcr: false,
          empty: false,
        };
      }

      if (!apiKey || ocrBudget <= 0) {
        // ⚠️ تجاوزنا السقف (أو مفيش مفتاح) ⇒ الصفحة بتتعلّم فاضية
        //    (والـ UI بيصرّح بالصفحات اللي متقرتش).
        return {
          index: i,
          number: i + 1,
          text: '',
          kind: 'page' as const,
          viaOcr: false,
          empty: true,
        };
      }
      ocrBudget -= 1;
      return {
        index: i,
        number: i + 1,
        text: '',
        kind: 'page' as const,
        viaOcr: true,
        empty: true,
      };
    });

    // ⚠️ الـ OCR **متزامن** — بنعمله في loop تاني بعد الـ map (عشان
    //    ترتيب الأولوية: الصفحات الفاضية بالترتيب).
    if (apiKey) {
      for (const page of pages) {
        if (!page.viaOcr) continue;
        try {
          const rendered = await renderPageAsImage(pdf, page.number, {
            scale: 1.5,
            toDataURL: false,
          });
          const pngBytes = new Uint8Array(rendered as ArrayBuffer);
          const ocrText = await extractTextFromImage(
            apiKey,
            pngBytes,
            `page-${page.number}.png`,
            'image/png'
          );
          page.text = ocrText.trim();
          page.empty = page.text.replace(/\s/g, '').length < MIN_USEFUL_CHARS;
        } catch (err) {
          if (err instanceof ExtractError) {
            if (
              err.code === 'OCR_AUTH_FAILED' ||
              err.code === 'OCR_QUOTA_EXCEEDED' ||
              err.code === 'OCR_TIMEOUT'
            ) {
              throw err;
            }
          }
          console.error('PDF page OCR failed:', err);
        }
      }
    }

    text = pages.map((p) => p.text).join('\n\n');
  } else if (kind === 'pptx') {
    const slides = await extractPptxSlides(
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      ) as ArrayBuffer
    );
    if (slides.length === 0) {
      throw new ExtractError(
        'مفيش شرائح في الملف ده (أو الملف مش عرض تقديمي سليم).',
        422,
        'PPTX_NO_SLIDES'
      );
    }
    pages = slides.map((slide, i) => ({
      index: i,
      number: i + 1,
      text: slide.text,
      kind: 'slide' as const,
      viaOcr: false,
      empty: slide.text.trim() === '',
    }));
    text = pages.map((p) => p.text).join('\n\n');
  } else if (kind === 'docx') {
    try {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      text = result.value;
    } catch (err) {
      console.error('DOCX parse failed:', err);
      throw new ExtractError('مقدرتش أفتح ملف الـ Word ده. جرّب تحفظه تاني.', 422, 'DOCX_PARSE_FAILED');
    }
    // ⚠️ **الـ DOCX مالوش صفحات** — الـ page count ناتج rendering مش
    //    data. فالمرجع الصحيح هو **الفقرة**، مش الصفحة.
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    pages = paragraphs.map((paragraph, i) => ({
      index: i,
      number: i + 1,
      text: paragraph,
      kind: 'paragraph' as const,
      viaOcr: false,
      empty: paragraph.length === 0,
    }));
  } else if (kind === 'image') {
    const apiKey = process.env.OCR_SPACE_API_KEY?.trim();
    // مفتاح OCR ناقص = خطأ صريح، مش طلب مجهول بيفشل بصمت
    if (!apiKey) {
      console.error('extract-text: OCR_SPACE_API_KEY غير معرف');
      throw new ExtractError('تحليل الصور غير متاح حالياً.', 503, 'OCR_NOT_CONFIGURED');
    }

    // النوع اللي بنبعته لـ ocr.space: لو المتصفح مبعتش type
    // بنستنتجه من الامتداد (عشان مش نبعته كـ application/octet-stream
    // اللي ocr.space بيرفضه بـ "Unable to recognize the file type")
    const ext = file.name.toLowerCase().split('.').pop() || '';
    const safeMime = file.type.startsWith('image/')
      ? file.type
      : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    text = await extractTextFromImage(apiKey, buffer, file.name, safeMime);
    pages = [
      {
        index: 0,
        number: 1,
        text: text.trim(),
        kind: 'page',
        viaOcr: true,
        empty: text.trim() === '',
      },
    ];
  } else {
    text = Buffer.from(buffer).toString('utf-8');
    pages = [
      {
        index: 0,
        number: 1,
        text: text.trim(),
        kind: 'page',
        viaOcr: false,
        empty: text.trim() === '',
      },
    ];
  }

  if (!text.trim()) {
    throw new ExtractError(
      kind === 'image'
        ? 'مفيش نص واضح في الصورة. اتأكد إن الكلام فيها واضح.'
        : 'مفيش نص اتقرا من الملف ده.',
      422,
      kind === 'image' ? 'IMAGE_NO_TEXT' : 'PDF_NO_TEXT'
    );
  }

  // Strip NULL bytes (U+0000) — they break PostgREST JSON serialization (22P05)
  const cleaned = text.replace(/\x00/g, '');
  const unread = pages.filter((p) => p.empty).map((p) => p.number);

  return {
    // ⚠️ نفس القطع（旧） — عشان `materials.content` يفضل زي ما كان.
    text: cleaned.slice(0, options.maxTextChars),
    pages: pages.map((p) => ({ ...p, text: p.text.replace(/\x00/g, '') })),
    pageCount: pages.length,
    kind,
    unread,
  };
}

/**
 * بيقرا ملف مرفوع ويرجّع نصه. بيرمي `ExtractError` برسالة عربية
 * مفهومة للمستخدم في كل حالات الفشل المتوقّعة.
 *
 * ⚠️ **سلوكه ما يتغيرش خالص** — بقى غلاف على `extractDocument`.
 *    (النص المدمج بيتقصّ بنفس الحد القديم بالظبط.)
 */
export async function extractTextFromFile(
  file: File,
  options: ExtractOptions
): Promise<string> {
  const doc = await extractDocument(file, options);
  return doc.text;
}
