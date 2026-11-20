// app/notes-shared/[id]/page.tsx
//
// 📖 لينك مشاركة الدفتر للقراءة فقط — /notes-shared/<shareId>.

"use client";

import React from "react";
import SharedNotebook from "@/components/notes/SharedNotebook";

export default function SharedNotebookPage() {
  return <SharedNotebook />;
}
