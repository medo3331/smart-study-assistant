// ===========================================================================
// MAGICLY — /inbox — صندوق الرسايل الموحد (C13)
// ---------------------------------------------------------------------------
// الواجهة كلها في InboxClient (دردشة + طلبات مراسلة + دعم فني).
// الرابط القديم /community/communication-center بيوجّه هنا برضو.
// ===========================================================================

import type { Metadata } from "next";
import InboxClient from "@/components/messaging/InboxClient";

export const metadata: Metadata = { title: "الرسايل — Magicly" };

export default function InboxPage() {
  return <InboxClient />;
}
