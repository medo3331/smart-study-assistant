/* شاشة التحميل الافتراضية لأي راوت. سيرفر كومبوننت، فمفيش useLanguage()
   ومفيش نص محتاج ترجمة — الهيكل نفسه هو الرسالة.
   بنقلّد تخطيط .band band-top عشان الصفحة ماتقفزش لما المحتوى الحقيقي ينزل. */
export default function Loading() {
  return (
    <main className="page" aria-busy="true" aria-live="polite">
      <section className="band band-top">
        {/* بديل .eyebrow */}
        <div className="row" style={{ gap: '10px', marginBottom: '18px' }}>
          <span style={{ width: '22px', height: '2px', background: 'var(--redpen)' }} />
          <span className="skel skel-line" style={{ width: '92px', height: '11px' }} />
        </div>

        {/* بديل .h1 — سطرين */}
        <div className="stack" style={{ gap: '14px', maxWidth: '22ch' }}>
          <span className="skel skel-title" style={{ display: 'block', width: '100%' }} />
          <span className="skel skel-title" style={{ display: 'block', width: '62%' }} />
        </div>

        {/* بديل .lede — تلات سطور */}
        <div className="stack" style={{ gap: '10px', maxWidth: '54ch', marginBlock: '26px 30px' }}>
          <span className="skel skel-line" style={{ display: 'block', width: '100%' }} />
          <span className="skel skel-line" style={{ display: 'block', width: '88%' }} />
          <span className="skel skel-line" style={{ display: 'block', width: '54%' }} />
        </div>

        {/* بديل الأزرار */}
        <div className="row" style={{ gap: '12px', flexWrap: 'wrap' }}>
          <span className="skel skel-block" style={{ width: '148px', height: '46px' }} />
          <span className="skel skel-block" style={{ width: '124px', height: '46px' }} />
        </div>

        {/* بديل شبكة الكروت اللي تحت الهيرو */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginTop: '44px',
          }}
        >
          <span className="skel skel-block" style={{ height: '132px' }} />
          <span className="skel skel-block" style={{ height: '132px' }} />
          <span className="skel skel-block" style={{ height: '132px' }} />
        </div>

        <span className="sr-only">جاري التحميل…</span>
      </section>
    </main>
  );
}
