import { apiFetch } from "@/lib/api-client";
import { normalizeContent } from "./helpers";
import type { PromptVersion } from "./types";

export async function callLLM(
  version: PromptVersion,
  query: string,
  context: string,
  projectId?: string,
  modelOverride?: string,
): Promise<{ text: string; tokens: number; spanId?: string }> {
  const messages = (version.template?.messages ?? []).map((m) => ({
    role: m.role,
    content: normalizeContent(m.content)
      .replace(/\{\{query\}\}/g, query)
      .replace(/\{\{context\}\}/g, context),
  }));

  const params = version.invocation_parameters?.openai ?? {};

  const res = await apiFetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelOverride || version.model_name || "gpt-4o-mini",
      messages,
      temperature: params.temperature ?? 0.7,
      promptLabel: version.description || version.id,
      projectId,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  return {
    text: data.choices[0].message.content,
    tokens: data.usage?.total_tokens ?? 0,
    spanId: data._spanId,
  };
}
