/**
 * 🔬 probe OpenRouter Images — يتحقق من الـ payload ضد الـ API الحقيقي.
 *
 * ⚠️ **ليه السكربت ده مهم**: الـ API بيرجّع **400** لأي body مخالف للـ
 *    schema (حتى قبل ما يوصل لحد الـ credits check). ⇒ لو الـ payload
 *    بتاعنا رجّع **402** (رصيد) ⇒ ده **دليل** إن الـ body عدّى
 *    validation. ده أقوى تأكيد ممكن من غير ما يكون فيه رصيد.
 *
 * ⚠️ **بيستهلك رصيد لو فيه** — تشغيله مع رصيد بيولّد صور فعلاً.
 *    من غير رصيد ⇒ كل الحالات بتبقى 402 (مفيش تكلفة).
 *
 * التشغيل: node scripts/probe-openrouter-payload.mjs
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const env = Object.fromEntries(
  readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v];
    }),
);

const apiKey = env.OPENROUTER_API_KEY?.trim();
if (!apiKey) {
  console.error("✗ مفيش OPENROUTER_API_KEY في .env.local");
  process.exit(2);
}

const URL = "https://openrouter.ai/api/v1/images";

const cases = [
  ["❌ body فاضي (مفيش model/prompt)", {}],
  ["❌ model ناقص", { prompt: "test" }],
  ["❌ prompt ناقص", { model: "black-forest-labs/flux.2-pro" }],
  [
    "❌ resolution خارج الـ enum",
    { model: "black-forest-labs/flux.2-pro", prompt: "x", resolution: "BOGUS" },
  ],
  [
    "❌ aspect_ratio خارج الـ enum",
    {
      model: "black-forest-labs/flux.2-pro",
      prompt: "x",
      resolution: "1K",
      aspect_ratio: "7:3",
    },
  ],
  [
    "✅ payload بتاعنا (flux.2-pro)",
    {
      model: "black-forest-labs/flux.2-pro",
      prompt: "a red panda astronaut",
      resolution: "1K",
      aspect_ratio: "16:9",
    },
  ],
  [
    "✅ payload بتاعنا (seedream-4.5)",
    {
      model: "bytedance-seed/seedream-4.5",
      prompt: "a red panda astronaut",
      resolution: "1K",
      aspect_ratio: "16:9",
    },
  ],
  [
    "✅ من غير resolution/aspect_ratio",
    { model: "black-forest-labs/flux.2-pro", prompt: "a red panda astronaut" },
  ],
];

console.log(`\n🔬 probe: ${URL}\n${"═".repeat(60)}`);

let invalidAccepted = 0;
for (const [label, body] of cases) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const code = text.match(/"code"\s*:\s*"?(\w+)/)?.[1] ?? "";
  const msg = text.match(/"message"\s*:\s*"([^"]+)"/)?.[1] ?? text.slice(0, 90).replace(/\s+/g, " ");
  console.log(`  ${label}\n     → ${res.status} ${code} — ${msg.slice(0, 130)}`);
  // ⚠️ body مش صالح لازم يرجّع 400 (مش 402/200).
  if (label.startsWith("❌") && res.status !== 400) invalidAccepted += 1;
}

console.log(`\n${"═".repeat(60)}`);
if (invalidAccepted > 0) {
  console.log(`❌ ${invalidAccepted} body مش صالح ماخدوش 400 — الـ schema اتغيّر؟`);
  process.exit(1);
}
console.log("✅ كل الـ bodies غير الصالحة رجّعت 400 ⇒ الـ validation شغّال.");
console.log(
  "   (لو payload بتاعنا رجّع 402 ⇒ الرصيد خلص، بس الـ body صحيح 100%)",
);
