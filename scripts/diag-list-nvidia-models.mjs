import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

/** سرد الموديلات المتاحة فعليًا على حساب NVIDIA (أسماء فقط، بدون أي أسرار). */
const apiKey = process.env.NVIDIA_API_KEY?.trim();
if (!apiKey) {
  console.log("NVIDIA_API_KEY = NOT_CONFIGURED");
  process.exit(0);
}
const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
  headers: { Authorization: `Bearer ${apiKey}` },
  signal: AbortSignal.timeout(20_000),
});
if (!res.ok) {
  console.log(`HTTP ${res.status}`);
  process.exit(0);
}
const data = await res.json();
const ids = (data?.data ?? []).map((m) => m?.id).filter(Boolean);
console.log(`total: ${ids.length}`);
console.log("--- deepseek family ---");
console.log(ids.filter((id) => /deepseek/i.test(id)).join("\n") || "(none)");
console.log("--- nemotron family (chat-ish, first 25) ---");
console.log(ids.filter((id) => /nemotron/i.test(id) && !/embed/i.test(id)).slice(0, 25).join("\n"));
