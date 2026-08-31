'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { dictionaries, Locale } from './dictionaries';

const LanguageContext = createContext<{
  locale: Locale;
  t: (typeof dictionaries)[Locale];
  toggle: () => void;
}>({
  locale: 'ar',
  t: dictionaries.ar,
  toggle: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('ar');

  useEffect(() => {
    const saved = localStorage.getItem('locale') as Locale | null;
    const initial = saved ?? 'ar';
    setLocale(initial);
          document.documentElement.lang = initial;
    document.documentElement.dir = dictionaries[initial].dir;
  }, []);

  const toggle = () => {
    const next: Locale = locale === 'ar' ? 'en' : 'ar';
    setLocale(next);
    document.documentElement.lang = next;
    document.documentElement.dir = dictionaries[next].dir;
    localStorage.setItem('locale', next);
  };

  return (
    <LanguageContext.Provider value={{ locale, t: dictionaries[locale], toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);