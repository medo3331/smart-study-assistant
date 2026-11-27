import { redirect } from "next/navigation";

/* 📚 دمج المكتبات — «ملفاتي» جزء من مساحة العمل دلوقتي (مصدر واحد للملفات والـ AI). */
export default function FilesPage() {
  redirect("/dashboard/workspace?tab=files");
}
