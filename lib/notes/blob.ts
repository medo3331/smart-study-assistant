// lib/notes/blob.ts
//
// 🖼️ تحويلات صور/بلوبات — بدون React وبدون fetch.
//
// ليه مش بنستخدم fetch(dataUrl)؟ لأن Firefox مش بيدعم fetch على
// data: URLs وبيرمي «Failed to fetch» — فبنفك الـ base64 يدوي بـ atob.

/** يحوّل data URL (base64) إلى Blob — null لو الشكل مش صالح. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match || !match[2]) return null;
  try {
    const type = match[1] ?? "application/octet-stream";
    const binary = atob(match[3]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type });
  } catch {
    return null;
  }
}
