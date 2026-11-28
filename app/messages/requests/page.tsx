import { redirect } from "next/navigation";

// طلبات المراسلة بقى تاب جوه صندوق الرسايل الموحد — الرابط القديم بيوجّه هناك.
export default function MessageRequestsPage() {
  redirect("/inbox");
}
