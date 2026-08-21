import { NextRequest, NextResponse } from 'next/server';
import { requireUser, checkRateLimit } from '@/lib/api-guard';
import { ExtractError, extractTextFromFile } from '@/lib/extract-text';

/* ==========================================================================
   تحليل ملف لمستخدم مسجّل.

   القراءة نفسها في `lib/extract-text.ts` — مشتركة مع راوت الديمو المفتوح.
   الراوت ده مسؤول عن المصادقة والحدود بس.
   ========================================================================== */

/** أقصى حجم ملف: ٨ ميجا (بينطبق على PDF و Word — دول بيتحللوا محلياً). */
const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** الصور ليها سقف أقل بكتير — السبب مشروح في lib/extract-text.ts. */
const MAX_IMAGE_BYTES = 1024 * 1024;
/** أقصى طول نص بنرجّعه للكلاينت. */
const MAX_TEXT_CHARS = 60_000;

export async function POST(request: NextRequest) {
  try {
    // ١) لازم مستخدم مسجّل
    const { user, response: authError } = await requireUser('flat');
    if (authError) return authError;

    // ٢) حدّ استخدام: تحليل الملفات غالي (OCR + توكنز)
    const limited = checkRateLimit(`analyze:${user.id}`, 10, 60_000, 'flat');
    if (limited) return limited;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'مفيش ملف اتبعت' }, { status: 400 });
    }

    const text = await extractTextFromFile(file, {
      maxFileBytes: MAX_FILE_BYTES,
      maxImageBytes: MAX_IMAGE_BYTES,
      maxTextChars: MAX_TEXT_CHARS,
    });

    return NextResponse.json({ text });
  } catch (error) {
    // أخطاء القراءة بتحمل رسالة مفهومة للمستخدم — منبلعهاش في ٥٠٠ عامة
    if (error instanceof ExtractError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error analyzing file:', error);
    return NextResponse.json({ error: 'حصل خطأ أثناء تحليل الملف' }, { status: 500 });
  }
}
