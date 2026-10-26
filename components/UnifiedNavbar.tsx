'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { TopControls } from '@/components/TopControls';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', labelAr: 'لوحة التحكم', labelEn: 'Dashboard' },
  { href: '/lesson', labelAr: 'الدروس', labelEn: 'Lessons' },
  { href: '/lectures', labelAr: 'المحاضرات', labelEn: 'Lectures' },
  { href: '/chat', labelAr: 'المساعد', labelEn: 'Assistant' },
  { href: '/shop', labelAr: 'المتجر', labelEn: 'Store' },
];

export function UnifiedNavbar() {
  const { locale } = useLanguage();
  const isAr = locale === 'ar';
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);

  // Avoid duplicate chrome on marketing/admin/auth routes that already have their own layouts.
  const show = pathname.startsWith('/dashboard') || pathname.startsWith('/chat') || pathname.startsWith('/lesson') || pathname.startsWith('/lectures') || pathname.startsWith('/store') || pathname.startsWith('/pricing');
  if (!show) return null;

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-white/10 bg-[var(--paper,#101524)]/90 backdrop-blur" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-bold text-[var(--accent,#f59e0b)]">
          <span>⚡</span>
          <span>Magicly</span>
        </Link>
        <div className="hidden items-center gap-2 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${active ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white'}`}
              >
                {isAr ? item.labelAr : item.labelEn}
              </Link>
            );
          })}
          <TopControls />
        </div>
        <button type="button" className="md:hidden rounded-lg p-2 text-white" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <div className="border-t border-white/10 px-4 pb-4 md:hidden">
          <div className="flex flex-col gap-2 pt-3">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${active ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white'}`}
                >
                  {isAr ? item.labelAr : item.labelEn}
                </Link>
              );
            })}
            <div className="pt-2">
              <TopControls />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
