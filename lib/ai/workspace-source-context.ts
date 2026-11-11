/* ==========================================================================
   Workspace Source Context — bounded context builder (Batch 4D.1)
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import { retrieveMaterialContent } from "./material-retrieval";
import {
  resolveWorkspaceSource,
  validateSourceOwnership,
  type ResolvedSource,
  type WorkspaceSourceResolution,
} from "./workspace-source-resolver";

export interface WorkspaceSourceContextOk {
  ok: true;
  source: ResolvedSource;
  context: string;
}

export interface WorkspaceSourceContextFail {
  ok: false;
  resolution: WorkspaceSourceResolution;
  message: string;
}

export type WorkspaceSourceContextResult = WorkspaceSourceContextOk | WorkspaceSourceContextFail;

const DEFAULT_MAX_CHARS = 8000;

export async function buildWorkspaceSourceContext(input: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  previousSourceId?: string | null;
  previousSourceFamily?: "lecture" | "material" | null;
  maxChars?: number;
  lectureId?: string | null;
}): Promise<WorkspaceSourceContextResult> {
  const { supabase, userId, message } = input;
  const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS;

  const resolution = await resolveWorkspaceSource({
    supabase,
    userId,
    message,
    previousSourceId: input.previousSourceId,
    previousSourceFamily: input.previousSourceFamily,
    lectureId: input.lectureId,
  });

  if (resolution.status !== "resolved" && resolution.status !== "empty_source") {
    return { ok: false, resolution, message: resolution.message ?? "Source not resolved." };
  }

  // empty_source has no source
  if (resolution.status === "empty_source") {
    return { ok: false, resolution, message: resolution.message ?? "Source has no usable content." };
  }

  const source = resolution.source;

  // revalidate ownership server-side
  const owned = await validateSourceOwnership(supabase, userId, source.family, source.id);
  if (!owned) {
    return {
      ok: false,
      resolution: { status: "not_found", candidates: [], message: "Source ownership could not be verified." },
      message: "Source ownership could not be verified.",
    };
  }

  if (source.family === "material") {
    const r = await retrieveMaterialContent(supabase, userId, source.id, maxChars);
    if (!r.ok) {
      return {
        ok: false,
        resolution: { status: "empty_source", source, message: r.message },
        message: r.message,
      };
    }
    // Clean NULL bytes (defensive)
    const cleaned = (r.material.content ?? "").replace(/\x00/g, "");
    return { ok: true, source, context: cleaned };
  }

  // lecture: read transcript_text with ownership filter
  try {
    const { data, error } = await supabase
      .from("lectures")
      .select("transcript_text")
      .eq("id", source.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) {
      return {
        ok: false,
        resolution: { status: "error", message: "Failed to load lecture content." },
        message: "Failed to load lecture content.",
      };
    }
    const raw = ((data as { transcript_text: string | null }).transcript_text ?? "");
    // Clean NULL bytes (defensive)
    const text = raw.replace(/\x00/g, "").trim();
    if (!text) {
      return {
        ok: false,
        resolution: { status: "empty_source", source, message: "Lecture has no transcript." },
        message: "Lecture has no transcript.",
      };
    }
    return { ok: true, source, context: text.slice(0, maxChars) };
  } catch (err) {
    console.error("[workspace-source-context] lecture fetch failed:", err);
    return {
      ok: false,
      resolution: { status: "empty_source", source, message: "Lecture content unavailable (NULL byte issue)." },
      message: "Lecture content unavailable.",
    };
  }
}
