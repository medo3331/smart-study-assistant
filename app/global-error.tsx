'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/* الشبكة الأخيرة: بتشتغل لما الـ layout الأساسي نفسه يقع.
   Next بيستبدل الـ root layout بالكامل، يعني الملف ده لازم يرسم <html> و<body>
   بنفسه — ومعناها كمان إننا برّه ThemeProvider و LanguageProvider. */
const paper = '#101524';
const paper2 = '#171E30';
const ink = '#E9EDF8';
const inkSoft = '#929DBA';
const marker = '#F0D24A';
const markerDeep = '#D8B932';
const redpen = '#E8697F';
const onMarker = '#232D49';
const supportWhatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.trim() || process.env.NEXT_PUBLIC_WHATSAPP_URL?.trim() || 'https://wa.me/201204556797';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [details, setDetails] = useState('');

  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  const whatsappMessage = [
    'أهلاً، أحتاج مساعدة في موقع ماجيكلي.',
    details.trim() ? `المشكلة: ${details.trim()}` : null,
    error.digest ? `كود التشخيص: ${error.digest}` : null,
  ].filter(Boolean).join('\n');
  const whatsappHref = `${supportWhatsapp}${supportWhatsapp.includes('?') ? '&' : '?'}text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '32px 24px', background: paper, color: ink, fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
        <main style={{ width: '100%', maxWidth: '52ch' }}>
          <p style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: inkSoft, fontFamily: 'ui-monospace, monospace' }}>
            <span style={{ width: '22px', height: '2px', background: redpen }} /> عطل عام
          </p>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.015em' }}>
            التطبيق <span style={{ background: marker, color: onMarker, padding: '0 0.14em', borderRadius: '3px' }}>وقف فجأة</span>
          </h1>
          <p style={{ margin: '18px 0 22px', fontSize: '17px', lineHeight: 1.75, color: inkSoft }}>
            حصلت مشكلة منعت الصفحة إنها تتحمّل من الأساس. حدّث الصفحة، ولو المشكلة فضلت موجودة استنى شوية وجرّب تاني.
          </p>
          <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', marginBottom: '26px', borderRadius: '8px', borderInlineStart: `3px solid ${redpen}`, background: paper2, fontSize: '14px', lineHeight: 1.55 }}>
            <span>التفاصيل التقنية اتسجّلت عندنا.{error.digest ? <> رقم البلاغ: <span style={{ direction: 'ltr', unicodeBidi: 'isolate', display: 'inline-block', fontFamily: 'ui-monospace, monospace' }}>{error.digest}</span></> : null}</span>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button type="button" onClick={reset} style={{ padding: '13px 26px', border: '1px solid transparent', borderRadius: '8px', background: marker, color: onMarker, boxShadow: `0 2px 0 ${markerDeep}`, fontSize: '16px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>حاول تاني</button>
            <Link href="/" style={{ padding: '13px 26px', border: `1px solid ${inkSoft}`, borderRadius: '8px', background: 'transparent', color: ink, fontSize: '16px', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>الرئيسية</Link>
          </div>
          <section style={{ display: 'grid', gap: '10px', marginTop: '24px', paddingTop: '20px', borderTop: `1px solid ${inkSoft}` }}>
              <label htmlFor="error-details">لو ما اتحلتش، اكتب كنت بتعمل إيه:</label>
              <textarea id="error-details" value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1000} rows={3} style={{ padding: '10px', borderRadius: '8px', font: 'inherit' }} />
              <a href={whatsappHref} target="_blank" rel="noreferrer" style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${inkSoft}`, background: 'transparent', color: ink, textAlign: 'center', textDecoration: 'none', font: 'inherit' }}>إرسال تقرير على واتساب</a>
          </section>
        </main>
      </body>
    </html>
  );
}
