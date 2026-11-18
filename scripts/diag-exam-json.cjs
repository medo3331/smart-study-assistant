#!/usr/bin/env node
/**
 * 🔬 **تشخيص JSON التوليد** (يكمل الشغل اللي في `scripts/test-ai-providers.mjs`).
 *
 * ⚠️ **اللي اكتشفناه**: الموديل السريع (`gpt-oss-20b`) بيرجّع **Array
 *    مباشر** `[ {…}, {…} ]` مش `{questions:[ … ]}` ⇒ الـparse كان
 *    بيرمي ⇒ كل بنود الامتحان فشلت (`PROVIDER_ERROR`) ⇒ 502/503.
 *
 * ℹ️ التشغيل: `npm run diag:exam:json` (أو `test:ai:groq:json`).
 * ⚠️ البرومبت **اصطناعي بالكامل** — مافيش بيانات طالب بتتبعت.
 */
const { execFileSync } = require("node:child_process");

const args = process.argv.slice(2);
execFileSync(process.execPath, ["scripts/test-ai-providers.mjs", "groq:json", ...args], {
  stdio: "inherit",
});
