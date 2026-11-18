import type { Metadata } from "next";
import NotesLibrary from "@/components/notes/NotesLibrary";

export const metadata: Metadata = {
  title: "دفاتري | Magicly",
  description: "دفاتر ملاحظات محلية بخط اليد — متعددة الصفحات ومحفوظة على جهازك.",
};

export default function NotesPage() {
  return <NotesLibrary />;
}
