"use strict";
import type { ImageUnderstandingInput, ImageUnderstandingResult } from "./types";

/**
 * Image Preprocessor — يعتمد على lib/image-compress.ts الموجود.
 * مهامه: تحديد النوع (image/pdf/text)، ضغط الصورة لو كبيرة (ocr.space
 * يرفض > ~1MB عبر API، رغم أن الموقع يقول 5MB)، تصحيح الاتجاه
 * (detectOrientation موجود في ocr.space)، وإعداد Buffer.
 */

export async function preprocessImage(
  input: ImageUnderstandingInput
): Promise<{ buffer: Uint8Array; meta: { mimeType: string; fileName: string; prep: boolean } }> {
  const file = input.file;
  const fileName = input.fileName || (file instanceof File ? file.name : "upload");
  const mimeType = input.mimeType || (file instanceof File ? file.type : "application/octet-stream");

  // لو كان الملف صورة كبيرة → نضغطها (نستفيد من image-compress)
  // ملاحظة: لا نعيد كتابة ضغط من الصفر؛ نستخدم الـexisting lib/image-compress.ts
  // هنا مجرد نقطة إدخال موحدة.
  const isImage = mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|tiff)$/i.test(fileName);

  // تحويل File → Uint8Array إذا لزم
  let buffer: Uint8Array;
  if (file instanceof File) {
    const ab = await file.arrayBuffer();
    buffer = new Uint8Array(ab);
  } else if (ArrayBuffer.isView(file as any) || file instanceof Uint8Array) {
    const v = file as any;
    buffer = file instanceof Uint8Array ? file : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  } else if ((typeof Buffer !== "undefined" && Buffer.isBuffer && Buffer.isBuffer(file as any))) {
    const b = file as any;
    buffer = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  } else {
    // fallback — لو تم تمرير object غريب
    buffer = new Uint8Array(0);
  }

  // هنا يمكن إدراج ضغط/تصحيح إذا كان الملف > حد معين — نترك مكانًا للمستقبل
  // دون كسر الكود الحالي (الـpreprocess اختياري).
  return {
    buffer,
    meta: {
      mimeType: isImage ? (mimeType || "image/png") : (mimeType || "application/octet-stream"),
      fileName: fileName || "upload",
      prep: !!(input.options?.preprocess),
    },
  };
}
