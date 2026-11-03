import React from "react";

interface NavbarHelpButtonProps {
  onOpen: () => void;
  isOnboardingOpen: boolean;
}

export function NavbarHelpButton({ onOpen, isOnboardingOpen }: NavbarHelpButtonProps) {
  return (
    <button
      onClick={onOpen}
      className="relative shrink-0 flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      aria-label="فتح مرشد المنصة"
    >
      <span className="icon-text"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M21 15l-3-3l-3.5 3.5L3 7l5 5 9.5-9.5z"/></svg></span>
      <span className="hidden sm:inline">مساعد</span>
      <span aria-hidden="true" className="absolute right-1 top-1 w-2 h-2 bg-emerald-500 rounded-full"></span>
    </button>
  );
}