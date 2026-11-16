"use client";

import React from "react";

/**
 * Phase 1A — SVG Text Prototype
 * ==============================
 * Tests: Arabic contextual shaping, RTL direction, mixed Arabic/English.
 * Uses browser text engine (SVG text). No fonts embedded.
 */

const SAMPLES: { label: string; text: string; dir: "rtl" | "ltr" }[] = [
  { label: "Arabic connected", text: "كتابة عربية متصلة", dir: "rtl" },
  { label: "Arabic with tashkeel", text: "كِتَابَةٌ عَرَبِيَّةٌ", dir: "rtl" },
  { label: "Mixed Arabic + English", text: "الدرس 3: Physics — الحركة", dir: "rtl" },
  { label: "English only", text: "The quick brown fox jumps over the lazy dog.", dir: "ltr" },
  { label: "Numbers + Arabic", text: "الصفحة ٤٢ من ١٠٠", dir: "rtl" },
  { label: "Long Arabic paragraph", text: "هذا نص تجريبي لاختبار تشكيل الحروف العربية واتجاه الكتابة من اليمين إلى اليسار في طبقة SVG.", dir: "rtl" },
];

export default function SvgTextPrototype() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-lg font-semibold">SVG Text Prototype (Phase 1A)</h2>
      <p className="text-sm text-gray-600">
        Tests Arabic contextual shaping, RTL direction, and mixed Arabic/English rendering via browser SVG text engine.
      </p>
      <div className="grid gap-4">
        {SAMPLES.map((s, i) => (
          <div key={i} className="rounded border border-gray-300 p-3">
            <div className="mb-1 text-xs font-medium text-gray-500">{s.label}</div>
            <svg
              width="100%"
              height="48"
              viewBox="0 0 600 48"
              className="block"
              style={{ direction: s.dir }}
            >
              <text
                x={s.dir === "rtl" ? 590 : 10}
                y={32}
                textAnchor={s.dir === "rtl" ? "end" : "start"}
                fontFamily="system-ui, 'Segoe UI', Tahoma, 'Noto Sans Arabic', sans-serif"
                fontSize="20"
                fill="#1f2937"
              >
                {s.text}
              </text>
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}
