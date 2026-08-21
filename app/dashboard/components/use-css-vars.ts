"use client";

import { useEffect, useState } from "react";

/**
 * بيقرا القيم الفعلية لتوكنز CSS من الجذر.
 *
 * ليه محتاجينه: recharts بيرسم SVG وبيحط الألوان كـ presentation attributes.
 * `var(--rule)` جوه attribute مش مضمون في كل المتصفحات، فالمكتبة محتاجة
 * قيمة لونية صريحة. وبما إن التوكنز بتتبدّل مع `data-theme`، بنراقب
 * التغيير ونعيد القراءة — من غير كده الرسم البياني بيفضل بألوان الثيم
 * القديم لحد ما الصفحة تتعملها ريفريش.
 */
export function useCssVars<T extends string>(names: readonly T[]): Record<T, string> {
  const key = names.join(",");
  const [values, setValues] = useState<Record<T, string>>(
    () => Object.fromEntries(names.map((n) => [n, ""])) as Record<T, string>
  );

  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      setValues(
        Object.fromEntries(
          key.split(",").map((n) => [n, cs.getPropertyValue(n).trim()])
        ) as Record<T, string>
      );
    };

    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [key]);

  return values;
}
