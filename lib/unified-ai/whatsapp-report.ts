/**
 * Magicly — WhatsApp Support Report Builder
 */

export interface IncidentReport {
  incidentId?: string;
  errorCode: string;
  stage?: string;
  attachmentType?: string;
  mimeType?: string;
  httpStatus?: number;
  timestamp?: string;
  appVersion?: string;
  provider?: string;
  model?: string;
  sanitizedSummary?: string;
}

export function buildWhatsAppReport(report: IncidentReport): string {
  const lines: string[] = ["حدث عطل فني", ""];
  if (report.incidentId) lines.push(`معرف البلاغ: ${report.incidentId}`);
  lines.push(`كود العطل: ${report.errorCode}`);
  if (report.stage) lines.push(`المرحلة: ${report.stage}`);
  if (report.attachmentType) lines.push(`نوع المرفق: ${report.attachmentType}`);
  if (report.mimeType) lines.push(`MIME: ${report.mimeType}`);
  if (report.httpStatus) lines.push(`HTTP Status: ${report.httpStatus}`);
  if (report.timestamp) lines.push(`الوقت: ${report.timestamp}`);
  if (report.appVersion) lines.push(`الإصدار: ${report.appVersion}`);
  if (report.provider) lines.push(`المزود: ${report.provider}`);
  if (report.model) lines.push(`الموديل: ${report.model}`);
  if (report.sanitizedSummary) lines.push(`الملخص: ${report.sanitizedSummary}`);
  return lines.join("\n");
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${digits}?text=${encoded}`;
}

export function getSupportPhone(): string | null {
  const raw =
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER
      : undefined) || "01204556797";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 8) return null;
  return String(raw).trim();
}
