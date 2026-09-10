import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "الداشبورد الجديدة",
  description: "نسخة معاينة من داشبورد Magicly الجديدة.",
  robots: { index: false, follow: false },
};

export default function DashboardNewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
