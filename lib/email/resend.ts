// Server-only Resend helper. Reuses the existing fetch-based integration
// (no SDK, no duplicate client). Secrets stay server-side.
export type ResendSendResult = {
  ok: boolean;
  id: string | null;
  error: string | null;
};

function getSender(): string | null {
  const from =
    process.env.FEEDBACK_EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM?.trim();
  if (!from) return null;
  return `ماجيكلي <${from}>`;
}

export async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string | null;
}): Promise<ResendSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const envFrom =
    process.env.FEEDBACK_EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM?.trim();
  const chosenFrom = (input.from || envFrom || "").trim();
  const sender = chosenFrom ? `ماجيكلي <${chosenFrom}>` : null;
  if (!apiKey || !sender) {
    return { ok: false, id: null, error: "RESEND_API_KEY or sender email missing" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, id: null, error: `Resend ${res.status}: ${detail.slice(0, 300)}` };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    // "accepted" by Resend is NOT proof of inbox delivery.
    return { ok: true, id: data?.id ?? null, error: null };
  } catch (err) {
    return { ok: false, id: null, error: err instanceof Error ? err.message : String(err) };
  }
}
