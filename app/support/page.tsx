import { redirect } from "next/navigation";

// الدعم مدموج في مركز التواصل الموحد (/inbox) — الرابط القديم بيوجّه هنا.
export default function SupportPage() {
  redirect("/inbox?category=support");
}
