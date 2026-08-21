import Link from 'next/link';

/* صفحة ٤٠٤ — سيرفر كومبوننت، فمش بتقدر تستخدم useLanguage().
   عشان كده النص عربي ثابت، متطابق مع lang="ar" dir="rtl" الافتراضي في الـ layout. */
export default function NotFound() {
  return (
    <main className="page">
      <section className="band band-top">
        <p className="eyebrow">404</p>
        <h1 className="h1">
          الصفحة دي <span className="mark mark-tilt">مش موجودة</span>
        </h1>
        <p className="lede" style={{ marginBlock: '18px 28px' }}>
          يمكن اللينك قديم، أو الصفحة اتنقلت. تعالى نرجعك لمكان تعرفه.
        </p>
        <div className="row" style={{ gap: '12px', flexWrap: 'wrap' }}>
          <Link href="/" className="btn btn-marker">
            الرئيسية
          </Link>
          <Link href="/dashboard" className="btn btn-quiet">
            لوحة المذاكرة
          </Link>
        </div>
      </section>
    </main>
  );
}
