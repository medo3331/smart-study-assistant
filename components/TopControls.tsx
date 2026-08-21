'use client';
import { useTheme } from '@/theme/ThemeProvider';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

/* أيقونات مرسومة بالسطر بدل الإيموجي — الإيموجي بيتغير شكله من نظام لنظام
   وبيكسر نبرة الصفحة */
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.8 6.8 0 0 0 11.1 11.1Z" />
    </svg>
  );
}

export function TopControls() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { locale, toggle: toggleLang } = useLanguage();

  /* الشكل كان object استايل inline بيتعاد بناؤه كل رندر ومنسوخ على
     الزرارين — بقى كلاس واحد في الستايل شيت (.ctl-pill).
     type="button" مكانش موجود: الزرار من غيره نوعه submit افتراضياً،
     وده بيفضّي أي فورم يتلفّ حواليه بعدين. */
  return (
    <div className="row ctl-row">
      <button
        type="button"
        onClick={toggleLang}
        aria-label={locale === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
        className="mono ctl-pill ctl-pill-text"
      >
        {locale === 'ar' ? 'EN' : 'عربي'}
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        className="ctl-pill ctl-pill-icon"
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>
    </div>
  );
}
