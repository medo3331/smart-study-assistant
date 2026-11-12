import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'mammoth',
    'tesseract.js',
    '@react-pdf/renderer',
    // ⚠️ **لازم!** `@napi-rs/canvas` (اللي بيستخدمه `unpdf` عشان
    //    يرندر صفحات PDF) **native** — لو Next bundlها، الـ binary
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
