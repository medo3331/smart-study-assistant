'use client';

import { useEffect, useState } from 'react';

/**
 * يرجّع true لو المستخدم طالب تقليل الحركة من إعدادات نظامه.
 * الـ CSS بيقفل الـ transitions لوحده، بس الأنيميشن اللي بالجافاسكريبت
 * (الكتابة حرف حرف، العدّاد) محتاج يشوف التفضيل بنفسه.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);

    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
