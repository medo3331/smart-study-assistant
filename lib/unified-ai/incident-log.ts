import { isServiceKeyConfigured, createServiceClient } from "@/lib/supabase/admin";
import { sanitizeErrorMessage } from "@/lib/runtime-errors";

export interface IncidentLogInput {
  incidentId: string;
  errorCode: string;
  stage?: string | null;
  httpStatus?: number;
  attachmentType?: string | null;
  mimeType?: string | null;
  provider?: string | null;
  model?: string | null;
  sanitizedSummary?: string | null;
  userId?: string | null;
}

/**
 * Best-effort server-side insertion of sanitized incident metadata into
 * `magicly_incidents`. Never throws. Never exposes secrets.
 *
 * Returns true on success, false otherwise. Safe to call even when the
 * migration has not been applied (insert simply fails and is swallowed).
 */
export async function logIncident(input: IncidentLogInput): Promise<boolean> {
  try {
    if (!isServiceKeyConfigured()) return false;
    const client = createServiceClient();
    const row = {
      incident_id: input.incidentId,
      error_code: input.errorCode,
      stage: input.stage ? sanitizeErrorMessage(input.stage) : null,
      http_status: typeof input.httpStatus === "number" ? input.httpStatus : null,
      attachment_type: input.attachmentType ?? null,
      mime_type: input.mimeType ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      sanitized_summary: input.sanitizedSummary
        ? sanitizeErrorMessage(input.sanitizedSummary)
        : null,
      user_id: input.userId ?? null,
    };
    const { error } = await client.from("magicly_incidents").insert(row);
    if (error) {
      console.warn(
        `[incident-log] could not persist incident [${error.code ?? "no-code"}]: ${sanitizeErrorMessage(error.message) ?? ""}`,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.warn(
      `[incident-log] unexpected failure: ${sanitizeErrorMessage(e) ?? ""}`,
    );
    return false;
  }
}
