import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkspaceOverview = {
  counts: { files: number; lectures: number; chats: number };
  recentMaterials: MaterialCard[];
  recentLectures: LectureCard[];
  recentChats: ChatCard[];
};

export type MaterialCard = {
  id: string;
  title: string;
  fileType: string | null;
  fileSize: number | null;
  createdAt: string;
  hasSummary: boolean;
  hasNote: boolean;
  contentLength: number;
};

export type LectureCard = {
  id: string;
  title: string | null;
  originalFilename: string | null;
  status: string;
  sourceType: string | null;
  createdAt: string;
  durationSeconds: number | null;
  subjectId: string | null;
};

export type ChatCard = {
  id: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
  lastMessagePreview: string | null;
};

export async function getWorkspaceOverview(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkspaceOverview> {
  // 1. Counts (parallel)
  const [filesCount, lecturesCount, chatsCount] = await Promise.all([
    supabase.from("materials").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("lectures").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("chat_conversations").select("*", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  // 2. Recent materials (10)
  const { data: materials } = await supabase
    .from("materials")
    .select("id, title, file_type, file_size, content, summary, note, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  // 3. Recent lectures (10)
  const { data: lectures } = await supabase
    .from("lectures")
    .select("id, title, original_filename, source_type, status, created_at, duration_seconds, subject_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  // 4. Recent chats (10)
  const { data: chats } = await supabase
    .from("chat_conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(10);

  // 5. Message counts per chat (single query, not N+1)
  const chatIds = (chats ?? []).map((c) => c.id);
  let messageStats: Record<string, { count: number; lastPreview: string | null }> = {};

  if (chatIds.length > 0) {
    const { data: messages } = await supabase
      .from("chat_messages")
      .select("conversation_id, content, created_at")
      .in("conversation_id", chatIds)
      .order("created_at", { ascending: false });

    for (const m of messages ?? []) {
      if (!messageStats[m.conversation_id]) {
        messageStats[m.conversation_id] = {
          count: 0,
          lastPreview: m.content?.slice(0, 120) ?? null,
        };
      }
      messageStats[m.conversation_id].count++;
    }
  }

  return {
    counts: {
      files: filesCount.count ?? 0,
      lectures: lecturesCount.count ?? 0,
      chats: chatsCount.count ?? 0,
    },
    recentMaterials: (materials ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      fileType: m.file_type,
      fileSize: m.file_size,
      createdAt: m.created_at,
      hasSummary: !!m.summary,
      hasNote: !!m.note,
      contentLength: m.content?.length ?? 0,
    })),
    recentLectures: (lectures ?? []).map((l) => ({
      id: l.id,
      title: l.title,
      originalFilename: l.original_filename,
      status: l.status ?? "pending",
      sourceType: l.source_type,
      createdAt: l.created_at,
      durationSeconds: l.duration_seconds ?? null,
      subjectId: l.subject_id ?? null,
    })),
    recentChats: (chats ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updated_at,
      messageCount: messageStats[c.id]?.count ?? 0,
      lastMessagePreview: messageStats[c.id]?.lastPreview ?? null,
    })),
  };
}