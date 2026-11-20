import SupportInbox from "@/components/support/SupportInbox";

export default async function DashboardSupportPage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  const { ticket } = await searchParams;
  return <SupportInbox mode="student" initialTicketId={ticket ?? null} />;
}
