/* ==========================================================================
   Workspace Source Resolver — Batch 4D.1 (server-side only)
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SourceFamily = "lecture" | "material";

export interface SourceCandidate {
  id: string;
  family: SourceFamily;
  title: string;
  createdAt: string | null;
}

export interface ResolvedSource {
  id: string;
  family: SourceFamily;
  title: string;
  createdAt: string | null;
}

export type ResolverStatus =
  | "resolved"
  | "ambiguous"
  | "not_found"
  | "none"
  | "empty_source"
  | "error";

export type WorkspaceSourceResolution =
  | { status: "resolved"; source: ResolvedSource }
  | { status: "ambiguous"; candidates: SourceCandidate[]; message?: string }
  | { status: "not_found"; candidates: SourceCandidate[]; message?: string }
  | { status: "none"; message?: string }
  | { status: "empty_source"; source: ResolvedSource | null; message?: string }
  | { status: "error"; message: string };

export interface ParsedSourceRequest {
  family: SourceFamily | "both";
  ordinal: number | "last" | null;
  titleQuery: string;
  temporal: "today" | "yesterday" | "last_week" | null;
  relativePrevious: boolean;
  raw: string;
}

const MAX_CANDIDATES = 8;
const MAX_QUERY_CHARS = 120;

const LECTURE_KEYWORDS = ["محاضره", "محاضرة", "محاضرات", "lecture", "lectures"];
const MATERIAL_KEYWORDS = [
  "ملف", "ملفات", "مستند", "مستندات", "pdf", "word", "docx", "material", "materials", "file", "files", "document", "documents",
];

const FILLER_WORDS = new Set([
  "اشرح", "اشرحلي", "لخص", "لخصلي", "افتح", "أفتح", "عن", "ل", "في", "اللي", "لي", "رقم", "number",
  "the", "a", "an", "please", "explain", "summarize", "open", "show",
]);

const ARABIC_ORDINALS: Record<string, number> = {
  "الأولى": 1, "الأول": 1, "الاولى": 1, "الاول": 1, "first": 1,
  "الثانية": 2, "الثاني": 2, "الثانيه": 2, "second": 2,
  "الثالثة": 3, "الثالث": 3, "third": 3,
  "الرابعة": 4, "الرابع": 4, "fourth": 4,
  "الخامسة": 5, "الخامس": 5, "fifth": 5,
  "السادسة": 6, "السادس": 6, "sixth": 6,
  "السابعة": 7, "السابع": 7, "seventh": 7,
  "الثامنة": 8, "الثامن": 8, "eighth": 8,
  "التاسعة": 9, "التاسع": 9, "ninth": 9,
  "العاشرة": 10, "العاشر": 10, "tenth": 10,
};

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseOrdinal(text: string): number | "last" | null {
  const t = normalize(text);
  if (/\b(last|الأخيرة|الاخيره|الاخير|الأخير|latest)\b/.test(t)) {
    if (/\b(previous|السابقة|السابق)\b/.test(t)) return null;
    return "last";
  }
  const numMatch = t.match(/(?:رقم|#|number)\s*(\d{1,4})/);
  if (numMatch) return parseInt(numMatch[1], 10);
  const bare = t.match(/^(\d{1,4})$/);
  if (bare) return parseInt(bare[1], 10);
  for (const [word, n] of Object.entries(ARABIC_ORDINALS)) {
    if (t.includes(word.toLowerCase())) return n;
  }
  const engOrd = t.match(/\b(\d{1,4})(?:st|nd|rd|th)\b/);
  if (engOrd) return parseInt(engOrd[1], 10);
  return null;
}

export function detectSourceFamily(text: string): SourceFamily | "both" {
  const t = normalize(text);
  const hasLecture = LECTURE_KEYWORDS.some((k) => t.includes(k));
  const hasMaterial = MATERIAL_KEYWORDS.some((k) => t.includes(k));
  if (hasLecture && !hasMaterial) return "lecture";
  if (hasMaterial && !hasLecture) return "material";
  return "both";
}

export function parseSourceRequest(message: string): ParsedSourceRequest {
  const raw = message ?? "";
  const t = normalize(raw);

  const family = detectSourceFamily(raw);

  const relativePrevious = /\b(previous|السابقة|السابق|الماضية|المحاضرة السابقة)\b/.test(t);

  let temporal: ParsedSourceRequest["temporal"] = null;
  if (/\b(today|اليوم)\b/.test(t)) temporal = "today";
  else if (/\b(yesterday|أمس|امس|البارحة)\b/.test(t)) temporal = "yesterday";
  else if (/\b(last week|الأسبوع الماضي|الاسبوع الماضي)\b/.test(t)) temporal = "last_week";

  const ordinal = relativePrevious ? null : parseOrdinal(raw);

  let titleQuery = raw;
  for (const kw of [...LECTURE_KEYWORDS, ...MATERIAL_KEYWORDS]) {
    const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    titleQuery = titleQuery.replace(re, " ");
  }
  titleQuery = titleQuery.replace(/(?:رقم|#|number)\s*\d{1,4}/gi, " ");
  titleQuery = titleQuery.replace(/\b\d{1,4}(?:st|nd|rd|th)\b/gi, " ");
  for (const w of Object.keys(ARABIC_ORDINALS)) {
    titleQuery = titleQuery.replace(new RegExp(w, "gi"), " ");
  }
  for (const f of FILLER_WORDS) {
    titleQuery = titleQuery.replace(new RegExp(`\\b${f}\\b`, "gi"), " ");
  }
  titleQuery = titleQuery.replace(/[^\w\u0600-\u06FF\s]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS);

  return { family, ordinal, titleQuery, temporal, relativePrevious, raw };
}
/* -------------------------------------------------------------------------- */
/*  Source fetching (server-side, ownership-filtered)                          */
/* -------------------------------------------------------------------------- */

interface LectureRow {
  id: string;
  title: string | null;
  original_filename: string | null;
  status: string | null;
  transcript_text: string | null;
  created_at: string;
}

interface MaterialRow {
  id: string;
  title: string | null;
  content: string | null;
  created_at: string;
}

function lectureTitle(r: LectureRow): string {
  return (r.title ?? r.original_filename ?? "محاضرة").trim() || "محاضرة";
}

function materialTitle(r: MaterialRow): string {
  return (r.title ?? "ملف").trim() || "ملف";
}

function isEligibleLecture(r: LectureRow): boolean {
  return r.status === "completed" && typeof r.transcript_text === "string" && r.transcript_text.trim().length > 0;
}

function isEligibleMaterial(r: MaterialRow): boolean {
  return typeof r.content === "string" && r.content.trim().length > 0;
}

async function fetchLectures(supabase: SupabaseClient, userId: string): Promise<LectureRow[]> {
  const { data, error } = await supabase
    .from("lectures")
    .select("id, title, original_filename, status, transcript_text, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LectureRow[];
}

async function fetchMaterials(supabase: SupabaseClient, userId: string): Promise<MaterialRow[]> {
  const { data, error } = await supabase
    .from("materials")
    .select("id, title, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MaterialRow[];
}

function toCandidateLecture(r: LectureRow): SourceCandidate {
  return { id: r.id, family: "lecture", title: lectureTitle(r), createdAt: r.created_at };
}
function toCandidateMaterial(r: MaterialRow): SourceCandidate {
  return { id: r.id, family: "material", title: materialTitle(r), createdAt: r.created_at };
}

function contains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export interface ResolveWorkspaceSourceInput {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  previousSourceId?: string | null;
  previousSourceFamily?: SourceFamily | null;
}

export async function resolveWorkspaceSource(
  input: ResolveWorkspaceSourceInput,
): Promise<WorkspaceSourceResolution> {
  const { supabase, userId, message } = input;
  if (!userId) {
    return { status: "error", message: "Authentication required." };
  }

  const parsed = parseSourceRequest(message);

  let lectures: LectureRow[] = [];
  let materials: MaterialRow[] = [];
  try {
    if (parsed.family === "lecture" || parsed.family === "both") {
      lectures = await fetchLectures(supabase, userId);
    }
    if (parsed.family === "material" || parsed.family === "both") {
      materials = await fetchMaterials(supabase, userId);
    }
  } catch {
    return { status: "error", message: "Failed to load workspace sources." };
  }

  const eligibleLectures = lectures.filter(isEligibleLecture);
  const eligibleMaterials = materials.filter(isEligibleMaterial);

  const scopedLectures = parsed.family === "material" ? [] : eligibleLectures;
  const scopedMaterials = parsed.family === "lecture" ? [] : eligibleMaterials;

  const allEligible: { family: SourceFamily; row: LectureRow | MaterialRow }[] = [
    ...scopedLectures.map((r) => ({ family: "lecture" as const, row: r })),
    ...scopedMaterials.map((r) => ({ family: "material" as const, row: r })),
  ];

  const candidates: SourceCandidate[] = [
    ...scopedLectures.map(toCandidateLecture),
    ...scopedMaterials.map(toCandidateMaterial),
  ].slice(0, 8);

  if (allEligible.length === 0) {
    const anyRaw =
      (parsed.family !== "material" && lectures.length > 0) ||
      (parsed.family !== "lecture" && materials.length > 0);
    if (!anyRaw) {
      return { status: "none", message: "No sources available." };
    }
    return { status: "empty_source", source: null, message: "Sources exist but have no usable content." };
  }

  if (parsed.temporal) {
    return {
      status: "ambiguous",
      candidates,
      message: "Timezone interpretation is uncertain; please clarify date.",
    };
  }

  if (parsed.relativePrevious) {
    const prevId = input.previousSourceId;
    const prevFamily = input.previousSourceFamily ?? (parsed.family !== "both" ? parsed.family : null);
    if (prevId && prevFamily) {
      const list = prevFamily === "lecture" ? eligibleLectures : eligibleMaterials;
      const found = list.find((r) => r.id === prevId);
      if (found) {
        const src: ResolvedSource =
          prevFamily === "lecture"
            ? { id: found.id, family: "lecture", title: lectureTitle(found as LectureRow), createdAt: (found as LectureRow).created_at }
            : { id: found.id, family: "material", title: materialTitle(found as MaterialRow), createdAt: (found as MaterialRow).created_at };
        return { status: "resolved", source: src };
      }
    }
    return { status: "not_found", candidates, message: "Previous source could not be verified." };
  }

  if (parsed.ordinal !== null) {
    const scopedSorted = [
      ...scopedLectures.map((r) => ({ family: "lecture" as const, row: r, created: r.created_at, id: r.id })),
      ...scopedMaterials.map((r) => ({ family: "material" as const, row: r, created: r.created_at, id: r.id })),
    ].sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : a.id < b.id ? -1 : 1));

    let idx: number;
    if (parsed.ordinal === "last") {
      idx = scopedSorted.length - 1;
    } else {
      idx = parsed.ordinal - 1;
    }
    if (idx < 0 || idx >= scopedSorted.length) {
      return { status: "not_found", candidates, message: "Requested ordinal does not exist." };
    }
    const pick = scopedSorted[idx];
    const src: ResolvedSource =
      pick.family === "lecture"
        ? { id: pick.row.id, family: "lecture", title: lectureTitle(pick.row as LectureRow), createdAt: (pick.row as LectureRow).created_at }
        : { id: pick.row.id, family: "material", title: materialTitle(pick.row as MaterialRow), createdAt: (pick.row as MaterialRow).created_at };
    return { status: "resolved", source: src };
  }

  if (parsed.titleQuery.trim().length > 0) {
    const q = parsed.titleQuery.trim();
    const matches = allEligible.filter(({ family, row }) => {
      const title = family === "lecture" ? lectureTitle(row as LectureRow) : materialTitle(row as MaterialRow);
      const filename = family === "lecture" ? ((row as LectureRow).original_filename ?? "") : "";
      const content = family === "lecture" ? ((row as LectureRow).transcript_text ?? "") : ((row as MaterialRow).content ?? "");
      return contains(title, q) || contains(filename, q) || contains(content.slice(0, 2000), q);
    });

    if (matches.length === 0) {
      return { status: "not_found", candidates, message: "No matching source found." };
    }
    if (matches.length === 1) {
      const m = matches[0];
      const src: ResolvedSource =
        m.family === "lecture"
          ? { id: m.row.id, family: "lecture", title: lectureTitle(m.row as LectureRow), createdAt: (m.row as LectureRow).created_at }
          : { id: m.row.id, family: "material", title: materialTitle(m.row as MaterialRow), createdAt: (m.row as MaterialRow).created_at };
      return { status: "resolved", source: src };
    }
    const ambCands = matches.slice(0, 8).map(({ family, row }) =>
      family === "lecture" ? toCandidateLecture(row as LectureRow) : toCandidateMaterial(row as MaterialRow),
    );
    return { status: "ambiguous", candidates: ambCands, message: "Multiple matching sources found." };
  }

  if (allEligible.length === 1) {
    const m = allEligible[0];
    const src: ResolvedSource =
      m.family === "lecture"
        ? { id: m.row.id, family: "lecture", title: lectureTitle(m.row as LectureRow), createdAt: (m.row as LectureRow).created_at }
        : { id: m.row.id, family: "material", title: materialTitle(m.row as MaterialRow), createdAt: (m.row as MaterialRow).created_at };
    return { status: "resolved", source: src };
  }

  return { status: "ambiguous", candidates, message: "Please specify which source you mean." };
}

export async function validateSourceOwnership(
  supabase: SupabaseClient,
  userId: string,
  family: SourceFamily,
  sourceId: string,
): Promise<boolean> {
  try {
    if (family === "lecture") {
      const { data, error } = await supabase
        .from("lectures")
        .select("id")
        .eq("id", sourceId)
        .eq("user_id", userId)
        .maybeSingle();
      return !error && !!data;
    }
    const { data, error } = await supabase
      .from("materials")
      .select("id")
      .eq("id", sourceId)
      .eq("user_id", userId)
      .maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}

