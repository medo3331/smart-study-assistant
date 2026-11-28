/* ==========================================================================
   اختبارات أداء التلاوة (مرتل / مجود) — منطق نقي بس.

   بيغطّي:
     - getAudioUrl: بناء رابط السورة حسب الأداء، والرجوع للمرتل لو
       القارئ ماعندوش نسخة مجودة.
     - extractMujawwadServer / isValidQuranServer: استخراج سيرفر المجود
       من شكل رد mp3quran الحقيقي (بفكستشرز منقولة من رد فعلي — ٢٨ نوفمبر).
     - normalizeReciter: تطبيع رابط المجود على الكلاينت (فحص النطاق).
     - FALLBACK_RECITERS: سلامة روابط المجود الاحتياطية.
   ========================================================================== */

import { describe, expect, it } from "vitest";
import { getAudioUrl } from "@/hooks/useQuranAudio";
import { normalizeReciter, type Reciter } from "@/hooks/useReciters";
import {
  FALLBACK_RECITERS,
  extractMujawwadServer,
  isValidQuranServer,
} from "@/app/dashboard/components/audio-library";

/* ------------------------------------------------------------------ */
/* getAudioUrl                                                          */
/* ------------------------------------------------------------------ */

describe("getAudioUrl", () => {
  const murattalReciter = {
    id: 1,
    name: "قارئ",
    arabicName: "قارئ",
    server: "https://server10.mp3quran.net/afs/",
    surahs: Array.from({ length: 114 }, (_, i) => i + 1),
    rewaya: "حفص عن عاصم — مرتل",
    language: "ar",
  };

  it("المرتل (الافتراضي) بيستخدم سيرفر المرتل", () => {
    expect(getAudioUrl(murattalReciter, 2)).toBe(
      "https://server10.mp3quran.net/afs/002.mp3"
    );
  });

  it("رقم السورة بيتكتب ٣ خانات", () => {
    expect(getAudioUrl(murattalReciter, 1)).toBe(
      "https://server10.mp3quran.net/afs/001.mp3"
    );
    expect(getAudioUrl(murattalReciter, 114)).toBe(
      "https://server10.mp3quran.net/afs/114.mp3"
    );
  });

  it("المجود بيستخدم سيرفر نسخة المجود", () => {
    const withMujawwad = {
      ...murattalReciter,
      mujawwadServer: "https://cdn.mp3quran.net/audio/maher-muaiqly/r3/",
    };
    expect(getAudioUrl(withMujawwad, 2, "mujawwad")).toBe(
      "https://cdn.mp3quran.net/audio/maher-muaiqly/r3/002.mp3"
    );
    // المرتل مايتأثرش بوجود نسخة المجود
    expect(getAudioUrl(withMujawwad, 2, "murattal")).toBe(
      "https://server10.mp3quran.net/afs/002.mp3"
    );
  });

  it("لو القارئ ماعندش نسخة مجودة بنرجع للمرتل — مفيش رابط مكسور", () => {
    const noMujawwad = { ...murattalReciter, mujawwadServer: null };
    expect(getAudioUrl(noMujawwad, 2, "mujawwad")).toBe(
      "https://server10.mp3quran.net/afs/002.mp3"
    );
    // ومفيش mujawwadServer أصلاً (شكل قديم/احتياطي)
    const legacy: Reciter = { ...murattalReciter };
    delete legacy.mujawwadServer;
    expect(getAudioUrl(legacy, 36, "mujawwad")).toBe(
      "https://server10.mp3quran.net/afs/036.mp3"
    );
  });
});

/* ------------------------------------------------------------------ */
/* extractMujawwadServer — فكستشرز منقولة من رد mp3quran الفعلي         */
/* ------------------------------------------------------------------ */

describe("extractMujawwadServer", () => {
  // شكل ماهر المعيقلي الحقيقي من الـ API (id 102): مجود r3، معلم r2، مرتل r1
  const maher = [
    {
      name: "حفص عن عاصم - المصحف المجود",
      moshaf_type: 12,
      server: "https://cdn.mp3quran.net/audio/maher-muaiqly/r3/",
      surah_total: 114,
      surah_list: "1,2,3",
    },
    {
      name: "حفص عن عاصم - المصحف المعلم",
      moshaf_type: 13,
      server: "https://cdn.mp3quran.net/audio/maher-muaiqly/r2/",
      surah_total: 38,
      surah_list: "1,2",
    },
    {
      name: "حفص عن عاصم - مرتل",
      moshaf_type: 11,
      server: "https://cdn.mp3quran.net/audio/maher-muaiqly/r1/",
      surah_total: 114,
      surah_list: "1,2,3",
    },
  ];

  it("بيطلع سيرفر المجود من المصاحف الحقيقية", () => {
    expect(extractMujawwadServer(maher)).toBe(
      "https://cdn.mp3quran.net/audio/maher-muaiqly/r3/"
    );
  });

  it("بيتجاهل المرتل والمعلم ويرجع null لو مفيش مجود", () => {
    const murattalOnly = [
      {
        name: "حفص عن عاصم - مرتل",
        server: "https://server10.mp3quran.net/afs/",
        surah_total: 114,
        surah_list: "1,2,3",
      },
      {
        name: "حفص عن عاصم - المصحف المعلم",
        server: "https://cdn.mp3quran.net/audio/x/r2/",
        surah_total: 38,
        surah_list: "1,2",
      },
    ];
    expect(extractMujawwadServer(murattalOnly)).toBeNull();
  });

  it("بيفضّل مصحف المجود الأكمل (أكتر سور)", () => {
    const moshafs = [
      {
        name: "حفص عن عاصم - المصحف المجود",
        server: "https://cdn.mp3quran.net/audio/x/partial/",
        surah_list: "1,2,3",
      },
      {
        name: "حفص عن عاصم - المصحف المجود",
        server: "https://cdn.mp3quran.net/audio/x/full/",
        surah_list: Array.from({ length: 114 }, (_, i) => i + 1).join(","),
      },
    ];
    expect(extractMujawwadServer(moshafs)).toBe(
      "https://cdn.mp3quran.net/audio/x/full/"
    );
  });

  it("عند التعادل بيفضّل رواية حفص", () => {
    const moshafs = [
      {
        name: "شعبة عن عاصم - المصحف المجود",
        server: "https://cdn.mp3quran.net/audio/x/shubah/",
        surah_list: "1,2,3",
      },
      {
        name: "حفص عن عاصم - المصحف المجود",
        server: "https://cdn.mp3quran.net/audio/x/hafs/",
        surah_list: "1,2,3",
      },
    ];
    expect(extractMujawwadServer(moshafs)).toBe(
      "https://cdn.mp3quran.net/audio/x/hafs/"
    );
  });

  it("بيطبع الشرطة الأخيرة على السيرفر", () => {
    const moshafs = [
      {
        name: "المصحف المجود",
        server: "https://cdn.mp3quran.net/audio/x/r2",
        surah_total: 114,
      },
    ];
    expect(extractMujawwadServer(moshafs)).toBe(
      "https://cdn.mp3quran.net/audio/x/r2/"
    );
  });

  it("بيرفض السيرفرات اللي برة النطاق المعروف", () => {
    const evil = [
      {
        name: "المصحف المجود",
        server: "https://mp3quran.net.evil.com/audio/x/",
        surah_total: 114,
      },
    ];
    expect(extractMujawwadServer(evil)).toBeNull();
    const http = [
      {
        name: "المصحف المجود",
        server: "http://cdn.mp3quran.net/audio/x/r1/",
        surah_total: 114,
      },
    ];
    expect(extractMujawwadServer(http)).toBeNull();
  });

  it("بيتعامل مع مدخلات الرقص (null / مش ليستة / عناصر بايظة)", () => {
    expect(extractMujawwadServer(null)).toBeNull();
    expect(extractMujawwadServer("مجود")).toBeNull();
    expect(extractMujawwadServer([null, 42, {}, { name: "المصحف المجود" }])).toBeNull();
  });
});

describe("isValidQuranServer", () => {
  it("بيقبل https على نطاق mp3quran", () => {
    expect(isValidQuranServer("https://server10.mp3quran.net/afs/")).toBe(true);
    expect(isValidQuranServer("https://cdn.mp3quran.net/audio/x/r1/")).toBe(true);
    expect(isValidQuranServer("https://mp3quran.net/api/")).toBe(true);
  });

  it("بيرفض أي حاجة تانية", () => {
    expect(isValidQuranServer("http://server10.mp3quran.net/afs/")).toBe(false);
    expect(isValidQuranServer("https://mp3quran.net.evil.com/")).toBe(false);
    expect(isValidQuranServer("not a url")).toBe(false);
    expect(isValidQuranServer(42)).toBe(false);
    expect(isValidQuranServer(undefined)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* normalizeReciter — تطبيع الكلاينت                                    */
/* ------------------------------------------------------------------ */

describe("normalizeReciter", () => {
  const base = {
    id: 51,
    name: "عبدالباسط عبدالصمد",
    server: "https://cdn.mp3quran.net/audio/abdulbasit-abdulsamad/r3/",
    surahs: [1, 2, 3],
  };

  it("بيمرّر رابط المجود الصالح زي ما هو", () => {
    const out = normalizeReciter({
      ...base,
      mujawwadServer: "https://cdn.mp3quran.net/audio/abdulbasit-abdulsamad/r1/",
    });
    expect(out.mujawwadServer).toBe(
      "https://cdn.mp3quran.net/audio/abdulbasit-abdulsamad/r1/"
    );
  });

  it("بيرفض رابط مجود من نطاق غريب ويحوّله لـ null", () => {
    const out = normalizeReciter({
      ...base,
      mujawwadServer: "https://evil.example.com/audio/x/r1/",
    });
    expect(out.mujawwadServer).toBeNull();
  });

  it("بيحوّل الغياب لـ null مش undefined", () => {
    expect(normalizeReciter(base).mujawwadServer).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* الفكستشرز الاحتياطية                                                 */
/* ------------------------------------------------------------------ */

describe("FALLBACK_RECITERS", () => {
  it("كل رابط مجود احتياطي https على نطاق mp3quran وبينتهي بـ /", () => {
    for (const r of FALLBACK_RECITERS) {
      if (!r.mujawwadServer) continue;
      expect(r.mujawwadServer.startsWith("https://"), r.name).toBe(true);
      expect(
        new URL(r.mujawwadServer).hostname.endsWith(".mp3quran.net"),
        r.name
      ).toBe(true);
      expect(r.mujawwadServer.endsWith("/"), r.name).toBe(true);
    }
  });

  it("فيه على الأقل ٣ قرّاء احتياطيين عندهم نسخة مجودة", () => {
    expect(
      FALLBACK_RECITERS.filter((r) => r.mujawwadServer).length
    ).toBeGreaterThanOrEqual(3);
  });
});
