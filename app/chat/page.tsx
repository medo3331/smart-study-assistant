import type { Metadata } from "next";
import { UnifiedChat } from "@/components/unified-ai/UnifiedChat";

export const metadata: Metadata = {
  title: "مساعد Magic — Unified AI",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(params: SearchParams, key: string): string {
  const v = params[key];
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

/**
 * المساعد الموحد الوحيد — يستقبل سياق الدرس من الداشبورد عبر query params
 * (?configId=&lessonDay=&subject=&lesson=&title=) ويمرره كـ hidden context.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const configId = first(params, "configId");
  const lessonDayRaw = first(params, "lessonDay");
  const lessonDay = lessonDayRaw && Number.isInteger(Number(lessonDayRaw)) ? Number(lessonDayRaw) : undefined;
  const subject = first(params, "subject");
  const lessonTopic = first(params, "lesson") || first(params, "topic");
  const title = first(params, "title");
  const content = first(params, "content");

  const initialContext: Record<string, unknown> = {};
  if (configId) initialContext.configId = configId;
  if (lessonDay !== undefined) initialContext.lessonDay = lessonDay;
  if (subject) initialContext.subject = subject;
  if (lessonTopic) initialContext.lesson = lessonTopic;

  const lesson =
    title || content || lessonTopic
      ? {
          title: title || lessonTopic || "",
          subject: subject || "",
          content: content || "",
          description: "",
        }
      : undefined;

  const hasContext = Object.keys(initialContext).length > 0;
  return <UnifiedChat initialContext={hasContext ? initialContext : undefined} lesson={lesson} />;
}
