import { useState, useEffect } from "react";
import { callLLM, normalizeContent, PromptVersion, ComparisonResult } from "@/lib/phoenix";
import { apiFetch } from "@/lib/api-client";

export interface VersionOption {
  promptName: string;
  label: string;
  version: PromptVersion;
}

export interface Column {
  id: string;
  promptId: string;
  /** Run target: "llm:{model_id}" for direct LLM call, "relay:{userId}" for connected agent. Empty = use prompt version's own model. */
  target: string;
  query: string;
  context: string;
  contextOpen: boolean;
  result: ComparisonResult | null;
  running: boolean;
  entering: boolean;
  spanId?: string;
}

function makeColumn(
  promptId: string,
  query: string,
  context: string,
  entering: boolean,
  target: string = "",
): Column {
  return {
    id: crypto.randomUUID(),
    promptId,
    target,
    query,
    context,
    contextOpen: false,
    result: null,
    running: false,
    entering,
  };
}

export function usePlaygroundColumns(versionOptions: VersionOption[], projectId?: string) {
  const [columns, setColumns] = useState<Column[]>([]);

  // Init first column once prompts load
  useEffect(() => {
    if (versionOptions.length > 0 && columns.length === 0) {
      setColumns([makeColumn(versionOptions[0].version.id, "", "", false)]);
    }
  }, [versionOptions, columns.length]);

  function addColumn() {
    const defaultId =
      versionOptions.length > 0 ? versionOptions[0].version.id : "";
    const firstQuery = columns[0]?.query ?? "";
    const firstContext = columns[0]?.context ?? "";
    const firstTarget = columns[0]?.target ?? "";
    const id = crypto.randomUUID();
    const newCol: Column = {
      ...makeColumn(defaultId, firstQuery, firstContext, true, firstTarget),
      id,
    };
    setColumns((prev) => [...prev, newCol]);
    // double-raf to let the 0-width paint before animating open
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setColumns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, entering: false } : c)),
        ),
      ),
    );
  }

  function removeColumn(colId: string) {
    if (columns.length <= 1) return;
    setColumns((prev) => prev.filter((c) => c.id !== colId));
  }

  function updateColumn(id: string, patch: Partial<Column>) {
    setColumns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }

  async function runColumn(colId: string) {
    const col = columns.find((c) => c.id === colId);
    if (!col || !col.query.trim()) return;
    const version = versionOptions.find(
      (o) => o.version.id === col.promptId,
    )?.version;
    if (!version) return;

    const baseLabel = version.description || version.id;
    const targetSuffix = col.target ? ` · ${col.target.split(":")[0]}` : "";
    const label = `${baseLabel}${targetSuffix}`;
    updateColumn(colId, {
      running: true,
      result: { label, text: "", tokens: 0, loading: true },
    });

    try {
      if (col.target.startsWith("relay:")) {
        if (!projectId) throw new Error("Missing project context for agent run");
        const text = await runViaRelay({
          projectId,
          targetUserId: col.target.slice("relay:".length),
          version,
          query: col.query,
          context: col.context,
          onPartial: (t) =>
            updateColumn(colId, {
              result: { label, text: t, tokens: 0, loading: true },
            }),
        });
        updateColumn(colId, {
          running: false,
          result: { label, text, tokens: 0, loading: false },
        });
        return;
      }

      // Direct LLM call. col.target may be "llm:{model_id}"; empty falls back to
      // the prompt version's own model.
      const modelOverride = col.target.startsWith("llm:")
        ? col.target.slice("llm:".length)
        : undefined;
      const r = await callLLM(version, col.query, col.context, projectId, modelOverride);
      updateColumn(colId, {
        running: false,
        result: { label, text: r.text, tokens: r.tokens, loading: false },
        spanId: r.spanId,
      });
    } catch (e: any) {
      updateColumn(colId, {
        running: false,
        result: {
          label,
          text: "",
          tokens: 0,
          loading: false,
          error: e.message,
        },
      });
    }
  }

  function runAll() {
    columns.forEach((c) => runColumn(c.id));
  }

  /**
   * Send the rendered prompt as a single user message via the WS relay to a
   * connected agent. We collect SSE chunks (`messages/partial` and
   * `messages/complete`) and return the final assistant text. Tool-call /
   * thinking events are ignored — the playground only displays the final text.
   */
  async function runViaRelay(opts: {
    projectId: string;
    targetUserId: string;
    version: PromptVersion;
    query: string;
    context: string;
    onPartial: (text: string) => void;
  }): Promise<string> {
    const rendered = (opts.version.template?.messages ?? []).map((m) => ({
      role: m.role === "system" ? "system" : "user",
      content: normalizeContent(m.content)
        .replace(/\{\{query\}\}/g, opts.query)
        .replace(/\{\{context\}\}/g, opts.context),
    }));

    const res = await apiFetch("/api/chat-relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: opts.projectId,
        targetUserId: opts.targetUserId,
        messages: rendered,
        threadId: `playground-${Date.now()}`,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Agent run failed (${res.status}): ${err}`);
    }
    if (!res.body) throw new Error("No response body from agent relay");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let finalText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const msg = JSON.parse(raw);
          if (msg.event === "error") {
            throw new Error(msg.data?.message ?? "Agent error");
          }
          if (msg.event === "messages/partial" || msg.event === "messages/complete") {
            const arr = Array.isArray(msg.data) ? msg.data : [];
            const ai = arr.find((m: any) => m?.type === "ai" || m?.role === "assistant");
            const content = ai?.content;
            if (typeof content === "string") {
              finalText = content;
              if (msg.event === "messages/partial") opts.onPartial(finalText);
            }
          }
        } catch {
          // ignore malformed lines
        }
      }
    }
    return finalText;
  }

  function syncColumnsToTrace(query: string, context: string) {
    setColumns((prev) =>
      prev.map((c) => ({ ...c, query, context, result: null })),
    );
  }

  function clearColumns() {
    setColumns((prev) =>
      prev.map((c) => ({ ...c, query: "", context: "", result: null })),
    );
  }

  return {
    columns,
    addColumn,
    removeColumn,
    updateColumn,
    runColumn,
    runAll,
    syncColumnsToTrace,
    clearColumns,
  };
}
