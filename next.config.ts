import type { NextConfig } from "next";

/**
 * ⚠️ أمان (P0، 2026-11): CSP كانت موجودة للسيرفس وركر بس (`/sw.js`).
 * دلوقتي فيه CSP أساسية لكل المسارات — تقلل أثر أي XSS (خصوصًا بعد
 * dangerouslySetInnerHTML في MermaidViewer) وتمنع تحميل سكربتات خارجية.
 *
 * ملاحظات:
 * - `'unsafe-inline'` لازمة في script-src لأن Next.js بيحقن سكربتات inline
 *   (RSC payload) بدون nonce إلا لو فيه middleware بيولّد nonce.
 * - `'unsafe-eval'` في التطوير فقط (HMR/React Refresh). الإنتاج نظيف.
 * - عدّل `connect-src` لو أضفت مزوّد AI بيتنادى من المتصفح مباشرة.
 */
const isDev = process.env.NODE_ENV !== "production";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
let supabaseOrigin = "";
let supabaseWsOrigin = "";
try {
  if (supabaseUrl) {
    const u = new URL(supabaseUrl);
    supabaseOrigin = u.origin;
    supabaseWsOrigin = `wss://${u.host}`;
  }
} catch {
  // env غير صالح — نعتمد على wildcard تحت.
}

const connectSrc = [
  "'self'",
  supabaseOrigin,
  supabaseWsOrigin,
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://api.resend.com",
  "https://generativelanguage.googleapis.com",
  "https://api.groq.com",
  "https://openrouter.ai",
  "https://api.openai.com",
  "https://*.vercel-insights.com",
]
  .filter(Boolean)
  .join(" ");

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  `connect-src ${connectSrc}`,
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "manifest-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'mammoth',
    'tesseract.js',
    '@react-pdf/renderer',
    // ⚠️ **لازم!** `@napi-rs/canvas` (اللي بيستخدمه `unpdf` عشان
    //    يرندر صفحات PDF) **native** — لو Next bundلها، الـ binary
    //    المنصّب للمنصة (مثل `@napi-rs/canvas-win32-x64-msvc`) مش
    //    بيلاقيها وقت التشغيل:
    //      Cannot find module '@napi-rs/canvas-win32-x64-msvc'
    //    ⇒ بتبقى external ويترجع Node يحلّها من node_modules.
    '@napi-rs/canvas',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), browsing-topics=()',
          },
        ],
      },
      {
        // السيرفس وركر: نوعه JS صريح، ماينفعش يتكاش عشان تحديثاته تتلقّط
        // بسرعة، وCSP صارمة تسمح بنفس-الأصل بس (زي ما بيعمل فعلاً).
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
