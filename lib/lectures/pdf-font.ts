/**
 * 📦 خط PDF العربي — مصدر واحد لخطوط المشروع
 * ═══════════════════════════════════════════════════════════════════════
 *
 * **سيرفر بس.**
 *
 * ═══ ليه الملف ده موجود ═══
 * كان فيه **نسختين** من تحميل الخط: واحدة في `lib/ai/file-generator.tsx`
 * (قدمت، من CDN، بخط Amiri) والتانية في `lib/lectures/lecture-document.tsx`
 * (جديدة، من القرص، بخط Cairo). تكرار معناه إن أي إصلاح للخط مرتين،
 * وأكتر من كده: النسخة القديمة **كانت مكسورة فعليًا**.
 *
 * ⚠️ **العطل الحقيقي (اتشخّص بالتشغيل مش بالتخمين):**
 *   TypeError: Cannot read properties of null (reading 'xCoordinate')
 *     at fontkit/opentype/GPOSProcessor.js -> getAnchor
 *
 * جدول `GPOS` في ملف **Amiri** فيه مرساة (anchor) ناقصة، و`fontkit` بيرجّع
 * `null` بدل ما يتعامل معاها، فالرسم كله بيقع. **مافيش PDF بيتولّد** مع
 * نص عربي واقعي — نفس العطل تمامًا في المسارين.
 *
 * اتأكدنا بالتجربة على نفس الجملة:
 *   Amiri -> FAIL | Cairo -> OK | Noto Naskh -> OK | Tajawal -> OK
 *
 * ═══ ليه Cairo ═══
 *   - `GPOS` بتاعه سليم مع `fontkit` (مقصود في الاختبارات).
 *   - sans-serif حديث وواضح جدًا — مناسب لمذكرة مذاكرة.
 *   - بيغطي العربي واللاتيني، فالمصطلحات الإنجليزية بتبان صح جوّه نص عربي.
 *
 * ═══ ليه محلي مش CDN ═══
 *   التحميل وقت الطلب كان بيعتمد على الإنترنت. نت أوي أو انقطاع = فشل
 *   تصدير. الخطوط دلوقتي في `public/fonts/` جواه الريبو.
 *
 * ⚠️ الـ fallback لـ Helvetica **مش** حل: العربي بيبقى مقطوع ومكسور.
 *   لو ملف الخط مفقود، ده عطل لازم يبان في اللوج مش يتسكت عنه.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { Font } from "@react-pdf/renderer";

/** مجلد الخطوط — `public/fonts/` (git-tracked). */
export const PDF_FONT_DIR = join(process.cwd(), "public", "fonts");

/** اسم العائلة المستخدم في كل أنماط الـ PDF. */
export const PDF_FONT_FAMILY = "MagiclyCairo";

/** بديل مضمون في PDF نفسه — عربي بيبقى وحش بس المستند بيطلع. */
export const PDF_FONT_FALLBACK = "Helvetica";

/** الأوزان المتاحة: عربي + لاتيني، عادي + غامق. */
const FONT_FILES: Array<{ file: string; weight: 400 | 700 }> = [
  { file: "cairo-arabic-400-normal.woff", weight: 400 },
  { file: "cairo-arabic-700-normal.woff", weight: 700 },
  { file: "cairo-latin-400-normal.woff", weight: 400 },
  { file: "cairo-latin-700-normal.woff", weight: 700 },
];

let registration: Promise<string> | null = null;

/**
 * يسجّل خط Cairo من القرص **مرة واحدة** لكل عملية.
 *
 * @returns اسم العائلة، أو `Helvetica` لو الملفات مفقودة (مع تحذير).
 */
export function ensurePdfFont(): Promise<string> {
  if (registration) return registration;
  registration = (async () => {
    try {
      const fonts = FONT_FILES.map(({ file, weight }) => {
        const path = join(PDF_FONT_DIR, file);
        if (!existsSync(path)) {
          throw new Error(`PDF font file missing: ${path}`);
        }
        return { src: path, fontWeight: weight };
      });
      Font.register({ family: PDF_FONT_FAMILY, fonts });
      return PDF_FONT_FAMILY;
    } catch (error) {
      console.warn(
        "[pdf-font] Cairo unavailable, falling back to",
        PDF_FONT_FALLBACK,
        "- Arabic will render BROKEN:",
        (error as Error).message,
      );
      return PDF_FONT_FALLBACK;
    }
  })();
  return registration;
}