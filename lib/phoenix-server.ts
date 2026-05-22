// Server-side Phoenix helpers. lib/phoenix.ts uses apiFetch (browser + Firebase auth),
// which is not available in Next.js route handlers — use these instead from server code.

import type { PromptInfo, PromptVersion } from "@/lib/phoenix";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

async function phoenixGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${PHOENIX}${path}`, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Phoenix GET ${path} failed (${res.status}): ${err}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchPromptInfosServer(): Promise<PromptInfo[]> {
  const data = await phoenixGet<{ data?: PromptInfo[] }>(`/v1/prompts`);
  return data.data ?? [];
}

export async function fetchPromptVersionsServer(name: string): Promise<PromptVersion[]> {
  const data = await phoenixGet<{ data?: PromptVersion[] }>(
    `/v1/prompts/${encodeURIComponent(name)}/versions`,
  );
  return data.data ?? [];
}

/**
 * Server-only: fetch only the Phoenix prompts whose `name` is in the allow-list,
 * paired with their versions. Used by the project-scoped prompts endpoint to
 * enforce that the playground never sees prompts outside the current project.
 */
export async function fetchPromptsScopedToProject(
  allowNames: string[],
): Promise<Array<{ prompt: PromptInfo; versions: PromptVersion[] }>> {
  if (allowNames.length === 0) return [];
  const allow = new Set(allowNames);
  const allPrompts = await fetchPromptInfosServer();
  const scoped = allPrompts.filter((p) => allow.has(p.name));
  return Promise.all(
    scoped.map(async (p) => ({
      prompt: p,
      versions: await fetchPromptVersionsServer(p.name),
    })),
  );
}

export async function createPromptServer(
  name: string,
  description: string,
  systemContent: string,
  userContent: string,
  modelName: string = "gpt-4o-mini",
  temperature: number = 0.7,
): Promise<void> {
  const res = await fetch(`${PHOENIX}/v1/prompts`, {
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
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Phoenix createPrompt failed (${res.status}): ${err}`);
  }
}
