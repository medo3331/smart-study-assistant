"use client";

import React from "react";

interface Props { children: React.ReactNode; fallback?: React.ReactNode }
interface State { hasError: boolean }

export class PrimaryErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): State {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[PrimaryErrorBoundary]", error);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <section className="sheet-card p-6 text-center" aria-label="خطأ بسيط">
          <p className="text-2xl" aria-hidden>🌟</p>
          <p className="mt-2 text-sm font-bold text-ink">حصل خلل بسيط</p>
          <p className="mt-1 text-xs text-ink-soft">جرّب تحدث الصفحة، ولو استمر تواصل معنا.</p>
        </section>
      );
    }
    return this.props.children;
  }
}
