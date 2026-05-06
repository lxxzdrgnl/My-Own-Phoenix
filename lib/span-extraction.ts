/**
 * Shared utilities for extracting query, response, and context from span data.
 * Used by: eval-backfill, span-tree-view, phoenix.ts trace fetching.
 */

/** Extract readable text from raw span output (generations, messages, content). */
export function extractText(raw: string): string {
  if (!raw) return "";
  try {
    const data = JSON.parse(raw);
    if (data.generations) return data.generations[0]?.[0]?.text ?? "";
    if (data.messages) {
      const msgs = Array.isArray(data.messages[0]) ? data.messages[0] : data.messages;
      for (const m of msgs) {
        const c = m?.kwargs?.content || m?.content;
        if (c) return String(c);
      }
    }
    if (data.content) return String(data.content);
    if (data.output) return String(data.output);
  } catch { /* not JSON */ }
  return raw;
}

/** Extract user query from raw span input. */
export function extractQuery(raw: string): string {
  if (!raw) return "";
  try {
    const data = JSON.parse(raw);
    const msgs = data.messages;
    if (Array.isArray(msgs)) {
      const flat = Array.isArray(msgs[0]) ? msgs[0] : msgs;
      for (const m of flat) {
        const role = m?.role || m?.type || "";
        const id = String(m?.id ?? "");
        // LangChain nested kwargs
        if (Array.isArray(m)) {
          for (const sub of m) {
            const c = sub?.kwargs?.content ?? "";
            const qMatch = c.match?.(/<question>([\s\S]*?)<\/question>/);
            if (qMatch) return qMatch[1].trim();
            if (c && sub?.id?.includes("HumanMessage")) return c.trim();
          }
          const last = m[m.length - 1];
          if (last?.kwargs?.content) return last.kwargs.content.trim();
          continue;
        }
        if (role === "user" || role === "human" || id.includes("HumanMessage")) {
          return m?.kwargs?.content || m?.content || "";
        }
      }
    }
    // OpenAI style: [{ role: "user", content: "..." }]
    if (Array.isArray(data)) {
      const userMsg = data.find((m: any) => m.role === "user" || m.type === "human");
      if (userMsg?.content) return String(userMsg.content);
    }
    if (data.input) return String(data.input);
    if (data.query) return String(data.query);
  } catch { /* not JSON */ }
  return raw;
}

/** Extract context from raw span input (e.g. <context> tags in messages). */
export function extractContext(raw: string): string {
  if (!raw) return "";
  try {
    const data = JSON.parse(raw);
    const msgs = data.messages;
    if (Array.isArray(msgs)) {
      const flat = Array.isArray(msgs[0]) ? msgs[0] : msgs;
      for (const m of flat) {
        const content = m?.kwargs?.content || m?.content || "";
        const ctxMatch = content.match(/<context>([\s\S]*?)<\/context>/);
        if (ctxMatch) return ctxMatch[1].trim();
      }
    }
  } catch { /* not JSON */ }
  return "";
}

/** Short preview of input for display in lists (truncated). */
export function extractInputPreview(input: string, maxLen = 80): string {
  const full = extractQuery(input);
  return full.trim().slice(0, maxLen);
}
