/** Shared LLM model registry — single source of truth for model-selector and agent-model-selector. */

export interface LlmModel {
  id: string;
  name: string;
}

export interface ModelFamily {
  label: string;
  models: LlmModel[];
}

export interface LlmProvider {
  name: string;
  icon: "openai" | "anthropic" | "google" | "xai";
  families: ModelFamily[];
}

export const LLM_PROVIDERS: LlmProvider[] = [
  {
    name: "OpenAI",
    icon: "openai",
    families: [
      {
        label: "GPT-5.4",
        models: [
          { id: "gpt-5.4", name: "gpt-5.4" },
          { id: "gpt-5.4-pro", name: "gpt-5.4-pro" },
          { id: "gpt-5.4-mini", name: "gpt-5.4-mini" },
          { id: "gpt-5.4-nano", name: "gpt-5.4-nano" },
        ],
      },
      {
        label: "GPT-5.x",
        models: [
          { id: "gpt-5.2", name: "gpt-5.2" },
          { id: "gpt-5.2-pro", name: "gpt-5.2-pro" },
          { id: "gpt-5.1", name: "gpt-5.1" },
          { id: "gpt-5", name: "gpt-5" },
          { id: "gpt-5-pro", name: "gpt-5-pro" },
          { id: "gpt-5-mini", name: "gpt-5-mini" },
          { id: "gpt-5-nano", name: "gpt-5-nano" },
        ],
      },
      {
        label: "GPT-4.1",
        models: [
          { id: "gpt-4.1", name: "gpt-4.1" },
          { id: "gpt-4.1-mini", name: "gpt-4.1-mini" },
          { id: "gpt-4.1-nano", name: "gpt-4.1-nano" },
        ],
      },
      {
        label: "GPT-4o",
        models: [
          { id: "gpt-4o", name: "gpt-4o" },
          { id: "gpt-4o-mini", name: "gpt-4o-mini" },
        ],
      },
      {
        label: "GPT-4 / 3.5",
        models: [
          { id: "gpt-4-turbo", name: "gpt-4-turbo" },
          { id: "gpt-4", name: "gpt-4" },
          { id: "gpt-3.5-turbo", name: "gpt-3.5-turbo" },
        ],
      },
      {
        label: "o-series",
        models: [
          { id: "o3-pro", name: "o3-pro" },
          { id: "o3", name: "o3" },
          { id: "o3-mini", name: "o3-mini" },
          { id: "o4-mini", name: "o4-mini" },
          { id: "o1-pro", name: "o1-pro" },
          { id: "o1", name: "o1" },
        ],
      },
    ],
  },
  {
    name: "Anthropic",
    icon: "anthropic",
    families: [
      {
        label: "Claude",
        models: [
          { id: "claude-opus-4-6", name: "claude-opus-4.6" },
          { id: "claude-sonnet-4-6", name: "claude-sonnet-4.6" },
          { id: "claude-haiku-4-5-20251001", name: "claude-haiku-4.5" },
        ],
      },
    ],
  },
  {
    name: "Google",
    icon: "google",
    families: [
      {
        label: "Gemini",
        models: [
          { id: "gemini-2.5-pro", name: "gemini-2.5-pro" },
          { id: "gemini-2.5-flash", name: "gemini-2.5-flash" },
          { id: "gemini-2.0-flash", name: "gemini-2.0-flash" },
        ],
      },
    ],
  },
  {
    name: "xAI",
    icon: "xai",
    families: [
      {
        label: "Grok",
        models: [
          { id: "grok-3", name: "grok-3" },
          { id: "grok-3-mini", name: "grok-3-mini" },
        ],
      },
    ],
  },
];
