import type { Metadata } from "next";
import { UnifiedChat } from "@/components/unified-ai/UnifiedChat";

export const metadata: Metadata = {
  title: "مساعد Magic — Unified AI",
  robots: { index: false, follow: false },
};

export default function ChatPage() {
  return <UnifiedChat />;
}
