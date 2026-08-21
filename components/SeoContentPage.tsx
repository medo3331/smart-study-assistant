import Link from 'next/link';
import { SubPageShell } from '@/components/SubPageShell';

export type SeoContentPageProps = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: Array<{
    title: string;
    body: string;
    items?: Array<{ title: string; body: string; icon?: string }>;
  }>;
  links: Array<{ href: string; label: string }>;
};

/**
 * قالب المقالات/الصفحات التعليمية العامة.
 *
 * يستعمل نفس الغلاف، شبكة البطاقات، وأزرار Magicly الموجودة في صفحات
 * الميزات؛ لذلك يضيف محتوى قابلًا للفهرسة من دون إنشاء واجهة موازية.
 */
export function SeoContentPage({ eyebrow, title, intro, sections, links }: SeoContentPageProps) {
  return (
    <SubPageShell>
      <article className="band band-top space-y-10">
        <header className="space-y-3">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="h1 measure">{title}</h1>
          <p className="lede measure">{intro}</p>
        </header>

        {sections.map((section) => (
          <section key={section.title} className="space-y-4" aria-labelledby={`section-${section.title}`}>
            <h2 id={`section-${section.title}`} className="h2 measure-tight">{section.title}</h2>
            <p className="muted hint measure">{section.body}</p>
            {section.items && (
              <ul className="features" role="list">
                {section.items.map((item) => (
                  <li key={item.title} className="f-card-wrap">
                    <div className="f-card">
                      {item.icon && <span className="f-card-icon" aria-hidden="true">{item.icon}</span>}
                      <h3 className="f-card-title">{item.title}</h3>
                      <p className="f-card-desc">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <nav className="ruled pt-6 space-y-3" aria-label="صفحات ذات صلة">
          <h2 className="h3">استكشف Magicly</h2>
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="btn btn-quiet btn-compact">
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </article>
    </SubPageShell>
  );
}
