"use client";
import { useEffect, useState } from "react";

export function AiCostBadge({ operation }: { operation: string }) {
  const [cost, setCost] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/ai/costs").then((r) => r.json()).then((d) => setCost(d?.costs?.[operation] ?? null)).catch(() => setCost(null));
  }, [operation]);
  if (cost === null) return null;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300"> costo: {cost} credits</span>;
}