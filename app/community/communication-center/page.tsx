import { redirect } from "next/navigation";

// مركز التواصل الموحد بقى /inbox — الرابط القديم بيوجّه هناك.
export default function CommunicationCenterPage() {
  redirect("/inbox");
}
