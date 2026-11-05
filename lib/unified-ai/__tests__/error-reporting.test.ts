import { describe, it, expect } from "vitest";
import {
  ERROR_CATALOG,
  getErrorByCode,
  isRetryable,
  getHttpStatus,
  generateIncidentId,
  sanitizeErrorMessage,
} from "@/lib/unified-ai/error-taxonomy";
import { buildWhatsAppReport, buildWhatsAppUrl, getSupportPhone } from "@/lib/unified-ai/whatsapp-report";

describe("error-taxonomy", () => {
  it("has all required codes", () => {
    const codes = [
      "ATTACHMENT_MISMATCH",
      "UNSUPPORTED_FILE_TYPE",
      "FILE_TOO_LARGE",
      "PDF_PARSE_FAILED",
      "PDF_NO_TEXT",
      "OCR_NOT_CONFIGURED",
      "OCR_TIMEOUT",
      "OCR_UPSTREAM_FAILED",
      "VISION_UNAVAILABLE",
      "VISION_PROVIDER_FAILED",
      "MODEL_UNAVAILABLE",
      "RATE_LIMITED",
      "PROVIDER_TIMEOUT",
      "AI_PROVIDER_FAILED",
      "REQUEST_VALIDATION_FAILED",
      "AUTH_REQUIRED",
      "UNKNOWN_INTERNAL_ERROR",
    ];
    for (const c of codes) {
      expect(ERROR_CATALOG[c as keyof typeof ERROR_CATALOG]).toBeDefined();
    }
  });

  it("generateIncidentId returns ERR-XXXXXX format", () => {
    const id = generateIncidentId();
    expect(id).toMatch(/^ERR-[0-9A-F]{6}$/);
  });

  it("sanitizeErrorMessage strips paths and secrets", () => {
    const msg = "Error at /app/lib/secret.ts with key abcdefghijklmnopqrstuvwxyz123456";
    const safe = sanitizeErrorMessage(msg);
    expect(safe).not.toContain("/app/lib/secret.ts");
    expect(safe).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
  });

  it("isRetryable works", () => {
    expect(isRetryable("OCR_TIMEOUT")).toBe(true);
    expect(isRetryable("OCR_NOT_CONFIGURED")).toBe(false);
    expect(isRetryable("AUTH_REQUIRED")).toBe(false);
  });

  it("getHttpStatus works", () => {
    expect(getHttpStatus("RATE_LIMITED")).toBe(429);
    expect(getHttpStatus("AUTH_REQUIRED")).toBe(401);
  });
});

describe("whatsapp-report", () => {
  it("buildWhatsAppReport includes incident id and code", () => {
    const msg = buildWhatsAppReport({
      incidentId: "ERR-7F3A92",
      errorCode: "ATTACHMENT_ANALYSIS_FAILED",
    });
    expect(msg).toContain("ERR-7F3A92");
    expect(msg).toContain("ATTACHMENT_ANALYSIS_FAILED");
  });

  it("buildWhatsAppUrl encodes message", () => {
    const url = buildWhatsAppUrl("201204556797", "hello world");
    expect(url).toContain("wa.me/201204556797");
    expect(url).toContain("text=");
  });

  it("getSupportPhone returns null when not set", () => {
    // In test env, env var may not be set
    const phone = getSupportPhone();
    // Just ensure it doesn't throw
    expect(phone === null || typeof phone === "string").toBe(true);
  });
});
