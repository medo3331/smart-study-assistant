"use strict";
export async function runLiveE2E(): Promise<any> {
  const nvidia = !!(process.env.NVIDIA_API_KEY || process.env.HERMES_CUSTOM_NVIDIA_CODING_API_KEY);
  const or = !!process.env.OPENROUTER_API_KEY;
  const groq = !!process.env.GROQ_API_KEY;
  const exam = { provider: "n/a", model: "n/a", status: "SKIPPED_NO_KEY", normalized: "NO_NVIDIA_KEY", preview: "" };
  const study = { provider: "n/a", model: "n/a", status: "SKIPPED_NO_KEY", normalized: "NO_NVIDIA_KEY", preview: "" };
  const fb = { provider: "n/a", model: "n/a", status: "SKIPPED_NO_KEY", normalized: "NO_OPENROUTER_KEY", preview: "" };
  if (nvidia) {
    const key = process.env.NVIDIA_API_KEY || process.env.HERMES_CUSTOM_NVIDIA_CODING_API_KEY || "";
    const start = Date.now();
    try {
      const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "nvidia/nemotron-3.5-lightning-30b-a3b", messages: [{ role: "user", content: "Solve: integral of 2x dx step by step." }] }),
      });
      const data = await res.json().catch(() => ({}));
      exam.provider = "nvidia"; exam.model = "nemotron-3.5-lightning-30b-a3b"; exam.latency_ms = Date.now()-start; exam.status = (res.ok && data.choices) ? "PASS" : "FAIL"; exam.normalized = res.ok ? "N/A" : `NVIDIA_${res.status}`; exam.preview = JSON.stringify(data).slice(0,120);
    } catch (e: any) { exam.latency_ms = Date.now()-start; exam.status = "FAIL"; exam.normalized = "NVIDIA_ERROR"; exam.preview = (e?.message||String(e)).slice(0,120); }
    // Study Tutor — same endpoint, study prompt
    const sStart = Date.now();
    try {
      const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "nvidia/nemotron-3.5-lightning-30b-a3b", messages: [{ role: "user", content: "اشرح درس Pointers بالعربية مع جزء أكاديمي بالإنجليزية." }] }),
      });
      const data = await res.json().catch(() => ({}));
      study.provider = "nvidia"; study.model = "nemotron-3.5-lightning-30b-a3b"; study.latency_ms = Date.now()-sStart; study.status = (res.ok && data.choices) ? "PASS" : "FAIL"; study.normalized = res.ok ? "N/A" : `NVIDIA_${res.status}`; study.preview = JSON.stringify(data).slice(0,120);
    } catch (e: any) { study.latency_ms = Date.now()-sStart; study.status = "FAIL"; study.normalized = "NVIDIA_ERROR"; study.preview = (e?.message||String(e)).slice(0,120); }
  }
  if (!nvidia || exam.status !== "PASS") {
    if (or) {
      const orKey = process.env.OPENROUTER_API_KEY || "";
      const s = Date.now();
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${orKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "openai/gpt-3.5-turbo", messages: [{ role: "user", content: "Hello" }] }),
        });
        const data = await res.json().catch(() => ({}));
        fb.provider = "openrouter"; fb.model = "openai/gpt-3.5-turbo"; fb.latency_ms = Date.now()-s; fb.status = (res.ok && data.choices) ? "PASS" : "FAIL"; fb.normalized = res.ok ? "N/A" : `OR_${res.status}`; fb.preview = JSON.stringify(data).slice(0,120);
      } catch (e: any) { fb.provider = "openrouter"; fb.model = "openai/gpt-3.5-turbo"; fb.latency_ms = Date.now()-s; fb.status = "FAIL"; fb.normalized = "OPENROUTER_ERROR"; fb.preview = (e?.message||String(e)).slice(0,120); }
    } else {
      fb.status = "SKIPPED_NO_KEY"; fb.normalized = "NO_OPENROUTER_KEY"; fb.provider = "n/a"; fb.model = "n/a";
    }
  }
  return { exam_solver: exam, study_tutor: study, fallback: fb, keys_present: { nvidia, openrouter: or, groq: groq } };
}
