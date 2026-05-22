// Pass/fail label classification
export const PASS_LABELS = new Set([
  "pass", "passed", "true", "yes", "correct", "factual", "faithful",
  "appropriate", "clean", "relevant", "positive", "success",
  "skipped", "partial",
]);

export const FAIL_LABELS = new Set([
  "fail", "failed", "false", "no", "incorrect", "hallucinated", "detected",
  "irrelevant", "unfaithful", "negative", "violated",
]);

// Agent types
export const AGENT_TYPES = [
  { value: "langgraph", label: "LangGraph" },
  { value: "rest", label: "REST SSE" },
] as const;

// Chat starter questions
export interface ChatSuggestion {
  title: string;
  label: string;
  prompt: string;
}

export const DEFAULT_CHAT_SUGGESTIONS: ChatSuggestion[] = [];

export const MAX_CHAT_SUGGESTIONS = 4;

// Per-user default prompt template, seeded into every newly created project as
// a starter Phoenix prompt. User can override it in General Settings.
export const PROMPT_TEMPLATE_KEY = "promptTemplate";

export interface PromptTemplate {
  system: string;
  context: string;
}

export const DEFAULT_PROMPT_TEMPLATE: PromptTemplate = {
  system: "당신은 도움이 되는 AI 어시스턴트입니다. 사용자의 질문에 정확하고 간결하게 답하세요. 모르는 내용은 솔직히 모른다고 답하세요.",
  context: "",
};

export function parsePromptTemplate(json: string | undefined): PromptTemplate {
  if (!json) return DEFAULT_PROMPT_TEMPLATE;
  try {
    const parsed = JSON.parse(json);
    return {
      system: typeof parsed.system === "string" ? parsed.system : DEFAULT_PROMPT_TEMPLATE.system,
      context: typeof parsed.context === "string" ? parsed.context : DEFAULT_PROMPT_TEMPLATE.context,
    };
  } catch {
    return DEFAULT_PROMPT_TEMPLATE;
  }
}

// Phoenix CHAT prompt standard:
//   - system message: the system prompt text as-is
//   - user message: optional context block + the mustache {{query}} variable
export function renderTemplateSystemMessage(t: PromptTemplate): string {
  return t.system;
}

export function renderTemplateUserMessage(t: PromptTemplate): string {
  const ctx = t.context.trim();
  return ctx ? `${ctx}\n\n{{query}}` : "{{query}}";
}

export function parseChatSuggestions(json: string | undefined): ChatSuggestion[] {
  if (!json) return DEFAULT_CHAT_SUGGESTIONS;
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return DEFAULT_CHAT_SUGGESTIONS;
    return parsed.filter(
      (s: any) => typeof s.title === "string" && typeof s.prompt === "string" && typeof s.label === "string",
    );
  } catch {
    return DEFAULT_CHAT_SUGGESTIONS;
  }
}
