export function normalizeMagId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let v = raw.trim().toUpperCase().replace(/\s+/g, "");
  const m = v.match(/^MAG([A-Z0-9]{3})([A-Z0-9]{4})$/);
  if (m) v = `MAG-${m[1]}-${m[2]}`;
  if (!/^MAG-[A-Z0-9]{3}-[A-Z0-9]{4}$/.test(v)) return null;
  return v;
}