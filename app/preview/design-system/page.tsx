"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Modal } from "@/components/ui/Modal";
import { Drawer } from "@/components/ui/Drawer";

import { EmptyState } from "@/app/dashboard/components/PageShell";
const THEMES = [
  "colorful", "crimson", "azure", "mono",
  "indigo-light", "warm-dark", "slate", "deep-green",
] as const;

export default function DesignSystemPreview() {
  const [theme, setTheme] = useState<string>("colorful");
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ltr, setLtr] = useState(false);

  useEffect(() => {
    const prev = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", theme);
    return () => { if (prev) document.documentElement.setAttribute("data-theme", prev); };
  }, [theme]);

  useEffect(() => {
    document.documentElement.dir = ltr ? "ltr" : "rtl";
    document.documentElement.lang = ltr ? "en" : "ar";
    return () => { document.documentElement.dir = "rtl"; document.documentElement.lang = "ar"; };
  }, [ltr]);

  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)] p-6">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">Design System V2 — Preview</h1>
          <p className="text-sm text-[var(--ink-soft)]">Preview only — does not change persisted theme.</p>
          <div className="flex flex-wrap gap-2">
            <span className="text-sm self-center">Theme:</span>
            {THEMES.map((t) => (
              <button key={t} onClick={() => setTheme(t)}
                className={`rounded px-2 py-1 text-xs border ${theme === t ? "bg-[var(--color-primary)] text-white" : "bg-[var(--paper-2)] text-[var(--ink)]"}`}>
                {t}
              </button>
            ))}
            <button onClick={() => setLtr((v) => !v)}
              className="rounded px-2 py-1 text-xs border bg-[var(--paper-2)] text-[var(--ink)]">
              {ltr ? "LTR (en)" : "RTL (ar)"}
            </button>
          </div>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Buttons</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary">Primary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="success">Success</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="primary" loading>Loading</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Card</h2>
          <Card>
            <p className="text-[var(--color-text-primary)]">Card content with primary text.</p>
            <p className="text-sm text-[var(--color-text-muted)]">Muted secondary text.</p>
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Input</h2>
          <Input label="Email" placeholder="you@example.com" />
          <Input label="Error" error="This field is required" />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Badge</h2>
          <div className="flex flex-wrap gap-2">
            <Badge>default</Badge>
            <Badge variant="primary">primary</Badge>
            <Badge variant="danger">danger</Badge>
            <Badge variant="success">success</Badge>
            <Badge variant="muted">muted</Badge>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Skeleton</h2>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-10 w-10" circle />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">ErrorState</h2>
          <ErrorState title="Something went wrong" message="Try again later." onRetry={() => {}} />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Modal &amp; Drawer</h2>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(true)}>Open Modal</Button>
            <Button variant="ghost" onClick={() => setDrawerOpen(true)}>Open Drawer</Button>
          </div>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Modal title">
            <p className="text-sm text-[var(--color-text-muted)]">Modal body content.</p>
          </Modal>
          <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Drawer title">
            <p className="text-sm text-[var(--color-text-muted)]">Drawer body content.</p>
          </Drawer>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">EmptyState</h2>
          <EmptyState icon="📭" title="No data" body="Nothing here yet." />
        </section>


        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Progress (semantic --color-progress)</h2>
          <div className="h-2 w-full rounded-full bg-[var(--color-surface-2)]">
            <div className="h-2 rounded-full bg-[var(--color-progress)]" style={{ width: "68%" }} />
          </div>
        </section>
      </div>
    </main>
  );
}