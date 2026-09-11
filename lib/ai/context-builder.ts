import type { AiChatMessage } from "./types";
import { appendSystemInstruction, truncateText } from "./prompt-engine";

export type ContextProfile = {
  full_name?: string;
  stage?: string;
  grade?: string;
  subjects?: string[];
  goal?: string;
  preferred_style?: string;
  daily_study_hours?: number;
};

export type BuildFullContextOptions = {
  maxHistoryMessages?: number;
};

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        single: () => Promise<{ data: ContextProfile | null }>;
        order?: (col: string, opts?: unknown) => {
          limit: (n: number) => Promise<{ data: Array<{ role: string; content: string }> | null }>;
        };
      };
    };
  };
  rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function scrubIds(text: string): string {
  return text.replace(UUID_RE, "[id]");
}

function profileSystemPrompt(profile: ContextProfile): string {
  const subjects = (profile.subjects ?? []).join("، ");
  const base = [
    "أنت مساعد دراسي شخصي.",
    profile.full_name ? `اسم الطالب: ${profile.full_name}` : "",
    profile.stage ? `المرحلة: ${profile.stage}` : "",
    profile.grade ? `الصف: ${profile.grade}` : "",
    subjects ? `المواد: ${subjects}` : "",
    profile.goal ? `الهدف: ${profile.goal}` : "",
    profile.preferred_style ? `أسلوب الشرح: ${profile.preferred_style}` : "",
    typeof profile.daily_study_hours === "number" ? `ساعات يومية: ${profile.daily_study_hours}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return appendSystemInstruction(base, "أجب بالعربية الفصحى المبسطة، بدون ذكر معرفات داخلية.");
}

/**
 * يبني رسائل الشات من الملف الشخصي + التاريخ + السؤال.
 * لا يحقن userId/sessionId في أي محتوى يروح للموديل.
 */
export async function buildFullContext(
  _userId: string,
  _sessionId: string,
  userMessage: string,
  options: BuildFullContextOptions = {},
  supabase?: SupabaseLike
): Promise<{ messages: AiChatMessage[] }> {
  void _userId;
  void _sessionId;
  const maxHistory = options.maxHistoryMessages ?? 10;

  let profile: ContextProfile = {};
  let history: Array<{ role: string; content: string }> = [];

  if (supabase) {
    try {
      const row = await supabase.from("profiles").select("*").eq("id", _userId).single();
      profile = row.data ?? {};
    } catch {
      profile = {};
    }
    try {
      const histQuery = supabase.from("chat_messages").select("role,content").eq("session_id", _sessionId);
      if (typeof histQuery.order === "function") {
        const hist = await histQuery.order("created_at", { ascending: true }).limit(200);
        history = hist.data ?? [];
      }
    } catch {
      history = [];
    }
  }

  const system: AiChatMessage = { role: "system", content: scrubIds(profileSystemPrompt(profile)) };
  const trimmedHistory = history.slice(-maxHistory).map((m) => ({
    role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
    content: scrubIds(truncateText(m.content, 4000)),
  }));
  const user: AiChatMessage = { role: "user", content: scrubIds(userMessage) };

  return { messages: [system, ...trimmedHistory, user] };
}
