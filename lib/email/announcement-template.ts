export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildAnnouncementEmail(input: {
  title: string;
  body: string;
  publishedAt?: string | null;
  magiclyUrl: string;
}): { subject: string; html: string; text: string } {
  const title = input.title.trim();
  const bodyText = input.body.trim();
  const bodyHtml = escapeHtml(bodyText).replace(/\n/g, "<br/>");
  const dateLabel = input.publishedAt ? new Date(input.publishedAt).toLocaleString("ar-EG") : "";

  const subject = `Magicly — ${title}`;

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Tahoma,Arial,sans-serif;color:#e2e8f0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1e293b;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:24px 28px;background:#f59e0b;color:#0f172a;font-size:20px;font-weight:700;">Magicly</td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 12px 0;font-size:22px;color:#f8fafc;">${escapeHtml(title)}</h1>
          ${dateLabel ? `<p style="margin:0 0 16px 0;font-size:12px;color:#94a3b8;">${escapeHtml(dateLabel)}</p>` : ""}
          <div style="font-size:15px;line-height:1.8;color:#e2e8f0;">${bodyHtml}</div>
          <div style="margin-top:28px;">
            <a href="${escapeHtml(input.magiclyUrl)}" style="display:inline-block;background:#f59e0b;color:#0f172a;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">فتح Magicly</a>
          </div>
        </td></tr>
        <tr><td style="padding:18px 28px;font-size:11px;color:#64748b;border-top:1px solid #334155;">
          هذا بريد إداري من Magicly. قبول Resend للطلب لا يعني وصول الرسالة إلى صندوق الوارد.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${title}\n\n${bodyText}\n\n${input.magiclyUrl}`;

  return { subject, html, text };
}
