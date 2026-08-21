'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/* صفحة الخطأ العامة لأي راوت جوه الـ layout.
   لازم تكون كلاينت كومبوننت وتاخد { error, reset } — ده شرط Next نفسه.
   مبدأ ثابت في المشروع: المستخدم بيشوف رسالة عامة، والتفاصيل تروح للكونسول بس. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  return (
    <main className="page">
      <section className="band band-top">
        <p className="eyebrow">خطأ</p>
        <h1 className="h1">
          حصل <span className="mark mark-tilt">عطل مؤقت</span>
        </h1>
        <p className="lede" style={{ marginBlock: '18px 22px' }}>
          مقدرناش نحمّل الصفحة دي. جرّب تاني، ولو فضلت تحصل ارجع للرئيسية.
        </p>

        <div className="notice notice-error" style={{ maxWidth: '54ch', marginBottom: '26px' }}>
          <span>
            التفاصيل التقنية اتسجّلت عندنا.
            {error.digest ? (
              <>
                {' '}
                رقم البلاغ: <span className="mono ltr-num">{error.digest}</span>
              </>
            ) : null}
          </span>
        </div>

        <div className="row" style={{ gap: '12px', flexWrap: 'wrap' }}>
          <button type="button" onClick={reset} className="btn btn-marker">
            حاول تاني
          </button>
          <Link href="/" className="btn btn-quiet">
            الرئيسية
          </Link>
        </div>
      </section>
    </main>
  );
}
