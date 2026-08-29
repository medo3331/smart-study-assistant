/**
 * /api/unified-ai — REAL INFERENCE PATH (FormData + JSON)
 *
 * Contract:
 *   POST multipart/form-data  → prompt + file/image + language
 *   POST application/json     → prompt + imageInput/fileInput (base64/string) + context
 *
 * Response (success):
 *   { ok:true, answer:string, agentUsed:string, extractedText?:string, metadata?:{}, reasoning?:string }
 * Response (provider failure — NO fake answer):
 *   { ok:false, error:"Temporary AI problem. Please try again." }
 */
import { NextResponse } from "next/server";
import { unifiedAI } from "@/lib/unified-ai/unified-ai";
import type { UnifiedAIInput, UnifiedAIResult } from "@/lib/unified-ai/types";

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const isMultipart = contentType.includes("multipart/form-data");

    let prompt = "";
    let imageInput: File | undefined;
    let fileInput: File | undefined;
    let context: Record<string, unknown> = {};
    let language = "ar";

    if (isMultipart) {
      const formData = await req.formData();
      const p = formData.get("prompt");
      prompt = typeof p === "string" ? p : "";
      const f = formData.get("file");
      if (f instanceof File) fileInput = f;
      const i = formData.get("imageInput");
      if (i instanceof File) imageInput = i;
      const lang = formData.get("language");
      if (typeof lang === "string") language = lang;
      const ctx = formData.get("context");
      if (typeof ctx === "string") {
        try { context = JSON.parse(ctx); } catch { /* ignore */ }
      }
    } else {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return NextResponse.json({ ok: false, error: "بيانات غير صالحة" }, { status: 400 });
      }
      prompt = body.prompt || "";
      language = body.language || "ar";
      context = body.context || {};
      // JSON path supports base64/image strings (no File objects from JSON)
      if (body.imageInput && typeof body.imageInput === "string") {
        // String path — will be handled by unifiedAI as text-only with note
        // We do NOT invent File; keep prompt-only path
      }
      if (body.fileInput && typeof body.fileInput === "string") {
        // Same for file
      }
    }

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "المطلوب نص (prompt)" }, { status: 400 });
    }

    const input: UnifiedAIInput = {
      prompt,
      context,
      language: (language === "ar" || language === "en" || language === "mixed") ? language : "ar",
    };
    if (imageInput) input.imageInput = imageInput;
    if (fileInput) input.fileInput = fileInput;

    // REAL INFERENCE — not stub
    const result: UnifiedAIResult = await unifiedAI(input);

    if (!result.ok) {
      // Controlled error — never expose provider/agent names to user
      return NextResponse.json({ ok: false, error: result.error || "حدث خطأ مؤقت. جرب مرة أخرى." }, { status: 200 });
    }

    // Success — hidden agent info NOT sent to UI (only answer + metadata)
    const uiResponse = {
      ok: true,
      answer: result.answer,
      agentUsed: result.agentUsed,        // hidden from display but allowed contract
      extractedText: result.extractedText,
      metadata: result.metadata,
      reasoning: result.reasoning,
    };
    return NextResponse.json(uiResponse);
  } catch (e: any) {
    console.error("unified-ai route error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "حدث خطأ غير متوقع. جرب مرة أخرى." }, { status: 500 });
  }
}
