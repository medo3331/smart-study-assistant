import { redirect } from "next/navigation";

// الدعم مدموج في مركز التواصل الموحد (/inbox) — الرابط القديم بيوجّه هنا.
export default async function DashboardSupportPage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  const { ticket } = await searchParams;
  redirect(ticket ? `/inbox?category=support&ticket=${encodeURIComponent(ticket)}` : "/inbox?category=support");
}
