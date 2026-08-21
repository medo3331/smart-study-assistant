import type { AiTaskType } from "./types";

export const AI_AGENT_IDS = ["marketing", "research", "content"] as const;
export type AiAgentId = (typeof AI_AGENT_IDS)[number];

export type AgentGenerationInput = {
  agent: AiAgentId;
  goal: string;
  brief?: string;
  audience?: string;
  tone?: string;
  output?: string;
  mode?: string;
};

export type AgentDefinition = {
  name: string;
  description: string;
  icon: string;
  modes: ReadonlyArray<{ id: string; label: string }>;
};

export const AI_AGENTS: Readonly<Record<AiAgentId, AgentDefinition>> = {
  marketing: {
    name: "Marketing Agent",
    description: "استراتيجية، حملات، أفكار إعلانية، جمهور، Hooks وCTA.",
    icon: "📣",
    modes: [
      { id: "copy", label: "نسخة تسويقية" },
      { id: "strategy", label: "استراتيجية أو حملة" },
    ],
  },
  research: {
    name: "Research Agent",
    description: "تحليل ومقارنات وتقارير مبنية على المعلومات التي تقدمها.",
    icon: "🔎",
    modes: [{ id: "analysis", label: "تحليل أو مقارنة" }],
  },
  content: {
    name: "Content Agent",
    description: "مقالات، منشورات، Scripts، رسائل، عناوين وCTA.",
    icon: "✍️",
    modes: [{ id: "create", label: "إنشاء محتوى" }],
  },
};

export function isAiAgentId(value: unknown): value is AiAgentId {
  return typeof value === "string" && (AI_AGENT_IDS as readonly string[]).includes(value);
}

function safeText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseAgentGenerationInput(value: unknown): AgentGenerationInput | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Record<string, unknown>;
  if (!isAiAgentId(data.agent)) return null;

  const goal = safeText(data.goal, 5_000);
  if (goal.length < 4) return null;

  return {
    agent: data.agent,
    goal,
    brief: safeText(data.brief, 4_000),
    audience: safeText(data.audience, 300),
    tone: safeText(data.tone, 120),
    output: safeText(data.output, 160),
    mode: safeText(data.mode, 40),
  };
}

export function taskForAgent(input: AgentGenerationInput): AiTaskType {
  if (input.agent === "marketing") return input.mode === "strategy" ? "marketing_plan" : "marketing_copy";
  if (input.agent === "research") return "data_analysis";
  return "content";
}

/** اقتراح واجهي فقط؛ لا يغيّر مسار الشات ولا يرسل مهمة تلقائيًا. */
export function suggestAgentFromText(text: string): AiAgentId | null {
  const normalized = text.toLowerCase();
  if (/حملة|تسويق|اعلان|إعلان|بوستات|منشورات|جمهور|cta|hook/i.test(normalized)) return "marketing";
  if (/بحث|قارن|مقارنة|تحليل سوق|منافسين|تقرير/i.test(normalized)) return "research";
  if (/مقال|سكريبت|script|كابشن|وصف منتج|ايميل|إيميل|محتوى/i.test(normalized)) return "content";
  return null;
}

export function buildAgentPrompt(input: AgentGenerationInput) {
  const details = [
    `الهدف: ${input.goal}`,
    input.brief && `التفاصيل المتاحة: ${input.brief}`,
    input.audience && `الجمهور: ${input.audience}`,
    input.tone && `النبرة: ${input.tone}`,
    input.output && `شكل النتيجة المطلوب: ${input.output}`,
  ].filter(Boolean).join("\n");

  if (input.agent === "marketing") {
    return {
      system: input.mode === "strategy"
        ? "أنت Marketing Agent. أنشئ خطة تسويقية عملية ومنظمة بالعربية: الهدف، الجمهور، الرسائل، القنوات، الجدول، KPIs وخطوات التنفيذ. لا تدّعِ امتلاك بيانات سوق حديثة غير موجودة في الطلب."
        : "أنت Marketing Agent. اكتب نسخة تسويقية عربية قابلة للاستخدام مباشرة. ركّز على القيمة والجمهور وHook واضح وCTA مناسب، ولا تخترع أرقامًا أو نتائج مؤكدة.",
      user: details,
    };
  }

  if (input.agent === "research") {
    return {
      system: "أنت Research Agent للتحليل والمقارنة. لا تملك Web Search أو وصولًا لمصادر حديثة في هذه الجلسة؛ لا تدّعِ البحث على الإنترنت ولا تنسب حقائق إلى مصادر لم تُعطَ لك. حلّل المعلومات التي يقدّمها المستخدم والمعرفة العامة بحذر، واذكر الافتراضات والفجوات بوضوح.",
      user: details,
    };
  }

  return {
    system: "أنت Content Agent. أنشئ محتوى عربيًا أصليًا ومناسبًا للنشر، منظمًا حسب شكل النتيجة المطلوب. لا تخترع حقائق أو ادعاءات قابلة للتحقق؛ إن نقص سياق جوهري، صرّح بافتراضك المختصر.",
    user: details,
  };
}
