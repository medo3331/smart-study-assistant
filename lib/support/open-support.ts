/**
 * openSupport — فتح ودجت الدعم من أي مكان في التطبيق.
 *
 * ⚡ ليه ملف منفصل؟ الودجت نفسها (`components/SupportWidget.tsx`) بقت
 * بتتحمّل lazily من `components/layout/DeferredOverlays.tsx`. صفحات زي
 * /login محتاجة **الزرار بس** (openSupport) مش كود الودجت كله — فالحدث
 * بقى في ملف مستقل عشان `import { openSupport }` مايشدّش المكوّن معاه.
 *
 * الودجت بتسمع الحدث `ssa:open-support` على `window`، فالملفين متصلين
 * بالاسم ده بس (مفيش مرجع مباشر من بعض).
 */

export const OPEN_SUPPORT_EVENT = "ssa:open-support";

export function openSupport(prefill = "") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<{ prefill: string }>(OPEN_SUPPORT_EVENT, {
      detail: { prefill },
    })
  );
}
