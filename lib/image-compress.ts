/* ==========================================================================
   تصغير الصور قبل رفعها للقراءة (OCR)

   ليه الملف ده موجود؟ خدمة القراءة المجانية (ocr.space) بترفض أي صورة
   أكبر من ١ ميجا **عن طريق الـ API** — الـ ٥ ميجا المكتوبة على موقعهم
   دي بتاعة الرفع اليدوي من المتصفح بس. وصورة كاميرا الموبايل العادية
   ٢–٥ ميجا، وسكرين شوت الشاشة الكبيرة يقدر يعدّي ١ ميجا بسهولة.

   فبدل ما نقول للطالب "صغّر الصورة بنفسك" (وهو غالباً مش عارف يعمل
   كده ولا لازم يعرف)، بنصغّرها في المتصفح قبل الرفع. ده كمان بيوفر
   رفع بيانات كتير على الموبايل.

   ⚠️ الموديول ده لازم ينادى من **كل** مكان بيرفع صور للراوت. أول نسخة
   كان التصغير مكتوب جوه شات ماجيك بس، فمساحة العمل فضلت ترفع الصورة
   خام وتقع على نفس السقف — عشان كده بقى مشترك هنا.
   ========================================================================== */

/** سقف خدمة القراءة. لازم يطابق MAX_IMAGE_BYTES في /api/analyze-file. */
export const MAX_IMAGE_UPLOAD_BYTES = 1024 * 1024;

/**
 * بنستهدف أقل من السقف بشوية عن قصد — لو طلعنا ٩٩٩ كيلو وفيه أي فرق
 * في حساب الحجم بين المتصفح والسيرفر بنبوظ على الحد بالظبط.
 */
const TARGET_BYTES = 940 * 1024;

/**
 * سلم الأبعاد (أطول ضلع بالبكسل). بنبدأ كبير عشان النص يفضل مقروء،
 * وننزل بس لو الجودة لوحدها مكفتش.
 * ⚠️ مننزلش تحت ١٠٠٠ — تحت كده الخط الصغير بيتلخبط والـ OCR بيقرا غلط،
 * وصورة صغيرة بنص غلط أوحش من رسالة خطأ صريحة.
 */
const DIMENSION_LADDER = [2200, 1800, 1400, 1100];

/** سلم الجودة لكل قياس. تحت ٠٫٤ بتبان آثار الضغط على حروف النص. */
const QUALITY_LADDER = [0.85, 0.68, 0.5, 0.4];

/** هل الملف ده صورة؟ (بالنوع أو بالامتداد لو المتصفح مبعتش نوع) */
export function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i.test(file.name)
  );
}

/**
 * صيغ كاميرا آيفون. Chrome و Firefox **مش بيفكوا** تشفيرها، فالتصغير
 * بيفشل والصورة بتفضل بحجمها الأصلي. لازم نقولها للمستخدم بصراحة
 * بدل ما نسيبه يستنى رفع ٤ ميجا وبعدين ياخد رسالة "الصورة كبيرة".
 */
export function isUndecodableImageFormat(file: File): boolean {
  return /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
}

/**
 * بيفك تشفير الصورة. `createImageBitmap` هو الأسرع والأنضف، وبنطلب منه
 * `from-image` عشان يحترم دوران الـ EXIF — صور الموبايل بتيجي بمعلومة
 * دوران، ولو رسمناها على الكانفس من غير احترامها بتطلع مقلوبة على جنب
 * والـ OCR بيرجع فاضي على صورة سليمة تماماً.
 * ولو فشل (بعض المتصفحات القديمة) بنرجع لـ <img> العادي.
 */
async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // fallback: <img> — بيحترم الـ EXIF لوحده في المتصفحات الحديثة
    const url = URL.createObjectURL(file);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("decode failed"));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function sourceSize(src: ImageBitmap | HTMLImageElement) {
  return src instanceof HTMLImageElement
    ? { w: src.naturalWidth, h: src.naturalHeight }
    : { w: src.width, h: src.height };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * بتصغّر الصورة لحد ما تنزل تحت سقف الرفع، وترجّع الملف الجديد.
 * لو الصورة أصلاً صغيرة بترجّعها زي ما هي (مفيش إعادة ترميز بلا داعي —
 * إعادة ترميز PNG نضيف لـ JPEG بتوحّش النص).
 * لو فشلت بترجّع الملف الأصلي، والمنادي بيتصرف على أساس الحجم.
 */
export async function shrinkImageForOcr(file: File): Promise<File> {
  if (file.size <= MAX_IMAGE_UPLOAD_BYTES) return file;

  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await decodeImage(file);
  } catch {
    return file;
  }

  try {
    const { w, h } = sourceSize(src);
    if (!w || !h) return file;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    const longest = Math.max(w, h);

    for (const maxDim of DIMENSION_LADDER) {
      // منكبّرش صورة صغيرة — التكبير بيضيف بكسلات مش بيضيف تفاصيل
      const scale = Math.min(1, maxDim / longest);
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));

      /* ⚠️ الخلفية البيضا مش رفاهية: JPEG مبيدعمش الشفافية، وأي منطقة
         شفافة في PNG بتتحول **أسود** في التحويل. سكرين شوت بخط أسود
         على خلفية شفافة كان بيطلع أسود على أسود = صفحة سودا والـ OCR
         بيرجع فاضي. فبنملا أبيض الأول وبعدين نرسم فوقه. */
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);

      for (const quality of QUALITY_LADDER) {
        const blob = await toBlob(canvas, quality);
        if (blob && blob.size <= TARGET_BYTES) {
          const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
          return new File([blob], newName, { type: "image/jpeg" });
        }
      }
    }

    return file;
  } catch {
    return file;
  } finally {
    if (!(src instanceof HTMLImageElement)) src.close();
  }
}

/**
 * بتجهّز أي ملف للرفع: الصور بتتصغّر، والباقي بيمشي زي ما هو.
 * بترجّع `error` جاهزة للعرض لو الصورة مستحيل تتصغّر — بكده المنادي
 * مش محتاج يعرف تفاصيل السقف ولا الصيغ.
 */
export async function prepareFileForUpload(
  file: File
): Promise<{ file: File; error?: string }> {
  if (!isImageFile(file)) return { file };

  const shrunk = await shrinkImageForOcr(file);
  if (shrunk.size <= MAX_IMAGE_UPLOAD_BYTES) return { file: shrunk };

  /* لسه فوق السقف. بنجرّب الأول وبعدين نلوم الصيغة — Safari **بيفك**
     تشفير HEIC عادي، فلو رفضناها من الأول كنا هنمنع رفع شغال على iOS. */
  return {
    file: shrunk,
    error: isUndecodableImageFormat(file)
      ? "صيغة HEIC مش بتتفتح في المتصفح فمقدرتش أصغّرها. حوّلها JPG أو خد سكرين شوت ليها وابعته."
      : "مقدرتش أصغّر الصورة كفاية لخدمة القراءة. خد سكرين شوت للجزء اللي فيه الكلام بس.",
  };
}
