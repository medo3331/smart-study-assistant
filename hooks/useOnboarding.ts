import { useEffect, useState } from "react";

export function useOnboarding(): {
  hasSeen: boolean;
  dismiss: () => void;
  planType: "free" | "pro" | "ultra";
} {
  // Check localStorage for dismiss state
  const [hasSeen, setHasSeen] = useState(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("magic_assistant_seen") : null;
    return stored === "true";
  });

  const [planType, setPlanType] = useState<"free" | "pro" | "ultra">("free");

  const dismiss = () => {
    setHasSeen(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("magic_assistant_seen", "true");
    }
  };

  // In production, you could fetch the user's plan from an API here
  // const { data: profile } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
  // setPlanType(profile?.plan as "free" | "pro" | "ultra" ?? "free");

  return { hasSeen, dismiss, planType };
}