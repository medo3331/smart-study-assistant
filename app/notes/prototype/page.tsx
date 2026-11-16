"use client";

import React, { useState } from "react";
import CanvasInkPrototype from "@/components/notes/CanvasInkPrototype";
import SvgTextPrototype from "@/components/notes/SvgTextPrototype";

export default function NotesPrototypePage() {
  const [tab, setTab] = useState<"canvas" | "text">("canvas");

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-4 text-2xl font-bold">Smart Notes — Phase 1A Prototype</h1>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("canvas")}
          className={`rounded px-4 py-2 ${tab === "canvas" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
        >
          Canvas Ink
        </button>
        <button
          type="button"
          onClick={() => setTab("text")}
          className={`rounded px-4 py-2 ${tab === "text" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
        >
          SVG Text
        </button>
      </div>
      {tab === "canvas" ? <CanvasInkPrototype /> : <SvgTextPrototype />}
    </div>
  );
}
