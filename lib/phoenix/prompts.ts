import { apiFetch } from "@/lib/api-client";
import type { PromptInfo, PromptVersion, PromptTag } from "./types";

export async function fetchPrompts(): Promise<PromptInfo[]> {
  const res = await apiFetch("/api/v1/prompts");
  const data = await res.json();
  return data.data ?? [];
}

export async function fetchPromptVersions(
  name: string,
): Promise<PromptVersion[]> {
  const res = await apiFetch(
    `/api/v1/prompts/${encodeURIComponent(name)}/versions`,
  );
  const data = await res.json();
  return data.data ?? [];
}

/** Fetch all prompts with their versions in parallel (avoids N+1). */
export async function fetchPromptsWithVersions(): Promise<
  Array<{ prompt: PromptInfo; versions: PromptVersion[] }>
> {
  const prompts = await fetchPrompts();
  const results = await Promise.all(
    prompts.map(async (p) => ({
      prompt: p,
      versions: await fetchPromptVersions(p.name),
    })),
  );
  return results;
}

/**
 * Project-scoped prompt list. Returns only the Phoenix prompts mapped to the
 * given DB project via the ProjectPrompt table. The playground and prompts
 * manager MUST use this — fetchPromptsWithVersions exposes every Phoenix
 * prompt globally and is forbidden in project-scoped UI.
 */
export async function fetchScopedPromptsWithVersions(
  projectId: string,
): Promise<Array<{ prompt: PromptInfo; versions: PromptVersion[] }>> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/prompts`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Scoped prompts fetch failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.prompts ?? [];
}

// --- Prompt Tags ---

export async function fetchPromptVersionTags(
  versionId: string,
): Promise<PromptTag[]> {
  const res = await apiFetch(
    `/api/v1/prompt_versions/${encodeURIComponent(versionId)}/tags`,
  );
  const data = await res.json();
  return data.data ?? [];
}

export async function addPromptVersionTag(
  versionId: string,
  tagName: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/v1/prompt_versions/${encodeURIComponent(versionId)}/tags`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tagName }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
}

export async function deletePromptVersionTag(
  versionId: string,
  tagName: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/v1/prompt_versions/${encodeURIComponent(versionId)}/tags/${encodeURIComponent(tagName)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
}

// --- Prompt CRUD ---

export async function createPrompt(
  name: string,
  description: string,
  systemContent: string,
  userContent: string,
  modelName: string = "gpt-4o-mini",
  temperature: number = 0.7,
): Promise<void> {
  const res = await apiFetch("/api/v1/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: { name, description },
      version: {
        description: "v1",
        model_provider: "OPENAI",
        model_name: modelName,
        template_type: "CHAT",
        template: {
          type: "chat",
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: userContent },
          ],
        },
        template_format: "MUSTACHE",
        invocation_parameters: { type: "openai", openai: { temperature } },
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(JSON.stringify(err.detail ?? err));
  }
}

export async function updatePrompt(
  name: string,
  description: string,
  versionDesc: string,
  systemContent: string,
  userContent: string,
  modelName: string = "gpt-4o-mini",
  temperature: number = 0.7,
): Promise<void> {
  const res = await apiFetch("/api/v1/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: { name, description },
      version: {
        description: versionDesc,
        model_provider: "OPENAI",
        model_name: modelName,
        template_type: "CHAT",
        template: {
          type: "chat",
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: userContent },
          ],
        },
        template_format: "MUSTACHE",
        invocation_parameters: { type: "openai", openai: { temperature } },
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(JSON.stringify(err.detail ?? err));
  }
}

export async function deletePrompt(name: string): Promise<void> {
  const res = await apiFetch(
    `/api/v1/prompts/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
}
