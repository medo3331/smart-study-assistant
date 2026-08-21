import type { Metadata } from "next";
import { ChatWorkspace } from "@/components/ChatWorkspace";

export const metadata: Metadata = {
  title: "مساعدك الذكي",
  robots: { index: false, follow: false },
};

export default function ChatPage() {
  return <ChatWorkspace />;
}
