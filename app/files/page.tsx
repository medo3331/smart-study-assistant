import type { Metadata } from "next";

import { FileManager } from "@/components/files/FileManager";
import "../files.css";

export const metadata: Metadata = {
  title: "ملفاتي — Magicly",
  description: "ملفات الطالب المرفوعة — فتح، تحميل، وذاكرة منها.",
};

export default function FilesPage() {
  return <FileManager />;
}
