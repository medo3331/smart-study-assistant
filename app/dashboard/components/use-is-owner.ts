"use client";

import { useEffect, useState } from "react";

/* ==========================================================================
   صاحب المنصة (Owner)

   هل المستخدم عنده حق لوحة الأدمن؟ الـ endpoint بيرجّع `isOwner` أو
   `canAccessAdmin` — الاتنين معناه واحد هنا: من هو صاحب المنصة.

   ⚠️ الفحص **من غير** ما يسرّب إيميل أو اسم. الـ endpoint بيرجّع من غير
   كده، وعندنا بند `ownerOnly` في القايمة (لوحة الأدمن) بيختفي لغير
   صاحب المنصة.

   💡 الكومبوننت ده هنا لوحده عشان مكانين بيحتاجوه: الشريط الجانبي
      (`NavRail`) والشريط العلوي (`SiteNavbar`). قبل ما يكون في مكانين،
      كان Hook جوّه `NavRail` واللي فوق محتاجينه ماكانوش يقدروا
      يستخدموه — فتكرّر الـ fetch أو اتركوا بند الأدمن مكشوف. دلوقتي
      الاتنين بيستخدموا نفس الـ Hook ونفس الـ endpoint.
   ========================================================================== */

interface IsOwnerResponse {
  isOwner?: boolean;
  canAccessAdmin?: boolean;
}

export function useIsOwner(): boolean {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/is-owner", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { isOwner: false, canAccessAdmin: false }))
      .then((j: IsOwnerResponse) => {
        if (alive) setIsOwner(Boolean(j?.isOwner || j?.canAccessAdmin));
      })
      .catch(() => {
        // مفيش جلسة أو الشبكة فصلت — النتيجة false والبند يختفي
      });
    return () => {
      alive = false;
    };
  }, []);

  return isOwner;
}
