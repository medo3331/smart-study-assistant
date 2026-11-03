export type ChatIntent =
  | "GENERAL_CHAT"
  | "WORKSPACE_SEARCH"
  | "RECORDED_LECTURES_SEARCH"
  | "CLARIFICATION";

export interface ChatIntentContext {
  activeSourceId?: string | null;
  activeSourceFamily?: "lecture" | "material" | null;
  previousMessages?: string[];
}

export interface ChatIntentResult {
  intent: ChatIntent;
  reason: string;
}

const RECORDED_KEYWORDS = [
  "تسجيل",
  "تسجل",
  "تفريغ",
  "recorded",
  "recording",
  "audio",
  "صوت",
  "voice",
  "transcript",
];

const WORKSPACE_KEYWORDS = [
  "ملف",
  "ملفات",
  "مستند",
  "مستندات",
  "محاضرة",
  "محاضرات",
  "workspace",
  "مساحة العمل",
  "material",
  "materials",
  "document",
  "documents",
  "file",
  "files",
];

const SEARCH_VERBS = [
  "دور",
  "ابحث",
  "هات",
  "أعطني",
  "اعطني",
  "افتح",
  "أفتح",
  "لخص",
  "لخّص",
  "اعرض",
  "أعرض",
  "أريد",
  "أبي",
  "give",
  "find",
  "search",
  "open",
  "show",
  "get",
  "fetch",
  "list",
  "summarize",
];

const FOLLOW_UP_KEYWORDS = [
  "أكتر",
  " اكثر",
  "more",
  "example",
  "المثال",
  "النقطة",
  "كمّل",
  "أكمل",
  "continue",
  "again",
];

function normalize(text: string): string {
  return (text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function containsAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word.toLowerCase()));
}

function hasSourceQualifier(text: string): boolean {
  if (/\d/.test(text)) return true;
  if (/رقم|#|number/.test(text)) return true;
  if (/الأولى|الثانية|الثالثة|الأول|الثاني|الثالث|first|second|third/.test(text)) return true;
  if (/ملفاتي|ملفاتك|مساحة العمل|workspace|uploaded|المرفوع|اللي رفعته|اللي رفعتها|my files/.test(text)) return true;
  if (/من\s+ملفات|في\s+مساحة|في\s+ملفات/.test(text)) return true;
  const titleWords = text
    .replace(/[^\w\u0600-\u06FF\s]/g, " ")
    .split(" ")
    .filter((w) => w.length >= 3);
  return titleWords.length >= 4;
}

export function classifyChatIntent(message: string, context: ChatIntentContext = {}): ChatIntentResult {
  const text = normalize(message);
  const hasRecorded = containsAny(text, RECORDED_KEYWORDS);
  const hasWorkspace = containsAny(text, WORKSPACE_KEYWORDS);
  const hasSearchVerb = containsAny(text, SEARCH_VERBS);
  const hasFollowUp = containsAny(text, FOLLOW_UP_KEYWORDS);

  // Recorded lectures are explicit and must not be routed to workspace materials.
  if (hasRecorded && (hasSearchVerb || /قال|what did|what does/.test(text))) {
    return { intent: "RECORDED_LECTURES_SEARCH", reason: "recorded-lecture keywords with request" };
  }

  // Explicit workspace/source requests.
  if (hasWorkspace && hasSearchVerb) {
    if (!hasSourceQualifier(text) && /^(هات|أعطني|اعطني|get|give)\b/.test(text)) {
      return { intent: "CLARIFICATION", reason: "source requested without enough qualifier" };
    }
    return { intent: "WORKSPACE_SEARCH", reason: "workspace keywords with search verb" };
  }

  // Possessive/uploaded source references are explicit even with explain verbs.
  if (hasWorkspace && /اللي رفعته|اللي رفعتها|uploaded|my files|من ملفاتي|في ملفاتي|مساحة العمل|workspace/.test(text)) {
    return { intent: "WORKSPACE_SEARCH", reason: "explicit owned-source reference" };
  }

  // Follow-up to an active source should preserve that source.
  if (context.activeSourceId && hasFollowUp) {
    if (context.activeSourceFamily === "lecture" && containsAny(text, RECORDED_KEYWORDS)) {
      return { intent: "RECORDED_LECTURES_SEARCH", reason: "follow-up to recorded source" };
    }
    return { intent: "WORKSPACE_SEARCH", reason: "follow-up to active source" };
  }

  // A bare source noun with a generic retrieval verb is ambiguous.
  if (hasWorkspace && hasSearchVerb && !hasSourceQualifier(text)) {
    return { intent: "CLARIFICATION", reason: "ambiguous source request" };
  }

  return { intent: "GENERAL_CHAT", reason: "no explicit source request" };
}
