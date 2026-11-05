import Link from "next/link";

export function EmptyState({ title, cta }: {
  title: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl" dir="rtl">
      <p className="text-slate-400 mb-4">{title}</p>
      {cta && (
        <Link href={cta.href} className="text-sm rounded-lg bg-amber-500 px-4 py-2 text-black font-bold hover:bg-amber-400">
          {cta.label}
        </Link>
      )}
    </div>
  );
}