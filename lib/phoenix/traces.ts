import { apiFetch } from "@/lib/api-client";
import { fetchSpansAndAnnotations, mergeTraceAnnotations, buildSpanTree, extractTag, extractResponse } from "./helpers";
import { computeHasGuardrailTriggered } from "./guardrail";
import type { Trace, TraceTree, Annotation } from "./types";

export async function fetchTraces(
  projectName: string,
  spanKinds?: string,
  contentFilter?: string,
  startTime?: string,
  endTime?: string,
): Promise<Trace[]> {
  const { allSpans, annMap } = await fetchSpansAndAnnotations(projectName, startTime, endTime);
  return buildTraces(allSpans, annMap, spanKinds, contentFilter);
}

/** Build the deduplicated, root-span Trace list from already-fetched spans.
 *  Split out from fetchTraces so paginating callers can accumulate spans across
 *  pages and rebuild without refetching. */
export function buildTraces(
  allSpans: any[],
  annMap: Record<string, Annotation[]>,
  spanKinds?: string,
  contentFilter?: string,
): Trace[] {
  // Default: only root spans (no parent). With explicit spanKinds, filter all spans.
  const kinds = spanKinds?.split(",").filter(Boolean) ?? [];
  let filtered = kinds.length > 0 && !kinds.includes("ALL")
    ? allSpans.filter((s) => kinds.includes(s.span_kind))
    : allSpans.filter((s) => s.parent_id === null);

  // Filter by content type
  if (contentFilter === "RAG") {
    filtered = filtered.filter((s) => {
      const input = s.attributes?.["input.value"] ?? "";
      return input.includes("<context>") && input.includes("<question>");
    });
  } else if (contentFilter === "PLAYGROUND") {
    filtered = filtered.filter((s) =>
      (s.attributes?.["metadata.source"] ?? "") === "playground"
    );
  }

  // Build root span lookup
  const rootByTrace: Record<string, any> = {};
  for (const s of allSpans) {
    if (s.parent_id === null) rootByTrace[s.context.trace_id] = s;
  }

  // Deduplicate by trace — if multiple spans from same trace, use root
  const seenTraces = new Set<string>();
  const results: Trace[] = [];

  for (const s of filtered) {
    const traceId = s.context.trace_id;
    if (seenTraces.has(traceId)) continue;
    seenTraces.add(traceId);

    // Use root span for query/response extraction when available
    const root = rootByTrace[traceId] ?? s;
    const sid = root.context.span_id;
    const input = root.attributes?.["input.value"] ?? "";
    const output = root.attributes?.["output.value"] ?? "";
    const isRAG = input.includes("<context>") && input.includes("<question>");

    let query: string;
    let context: string;
    let response: string;

    if (isRAG) {
      query = extractTag(input, "question");
      context = extractTag(input, "context");
      response = extractResponse(output);
    } else {
      // ── Extract query ──
      query = "";

      // 1. Plain text "Query: ..." format (dexter-style)
      const queryLineMatch = input.match(/^Query:\s*(.+)/m);
      if (queryLineMatch) {
        query = queryLineMatch[1].trim();
      }

      // 2. JSON formats
      if (!query) {
        try {
          const parsed = JSON.parse(input);
          // { messages: [{ type: "human", content }] } (LangGraph)
          if (Array.isArray(parsed?.messages)) {
            for (const msg of parsed.messages) {
              if ((msg?.type === "human" || msg?.role === "user") && msg?.content) {
                query = String(msg.content);
                break;
              }
              if (Array.isArray(msg)) {
                for (const m of msg) {
                  if (m?.id?.includes?.("HumanMessage") || m?.type === "human") {
                    query = m?.kwargs?.content || m?.content || "";
                    break;
                  }
                }
                if (query) break;
              }
            }
          }
          // [{ role: "user", content }] (OpenAI)
          if (!query && Array.isArray(parsed)) {
            const userMsg = parsed.find((m: any) => m.role === "user" || m.type === "human");
            if (userMsg?.content) query = String(userMsg.content);
          }
          // { input: "..." } or { query: "..." }
          if (!query && parsed?.input) query = String(parsed.input);
          if (!query && parsed?.query) query = String(parsed.query);
        } catch { /* plain-text input — not JSON, fallback to other extractors */ }
      }

      // 3. Plain text input (not JSON, not "Query:" format) — use as-is
      if (!query && input && !input.startsWith("{") && !input.startsWith("[")) {
        query = input.trim();
      }

      if (!query) query = root.attributes?.["metadata.prompt_label"] || root.name || "(unknown)";

      // ── Extract context ──
      // 1. From plain text "Data retrieved from tool calls:" section
      context = "";
      const toolDataMarker = "Data retrieved from tool calls:";
      const toolIdx = input.indexOf(toolDataMarker);
      if (toolIdx >= 0) {
        let raw = input.slice(toolIdx + toolDataMarker.length).trim();
        // Cut off metadata sections
        const metaCut = raw.indexOf("## Tool Usage");
        if (metaCut >= 0) raw = raw.slice(0, metaCut).trim();
        context = raw;
      }

      // 2. From sibling TOOL/RETRIEVER spans
      if (!context) {
        const traceSpans = allSpans.filter((ts) => ts.context?.trace_id === traceId);
        const contextParts: string[] = [];
        for (const ts of traceSpans) {
          const kind = String(ts.attributes?.["openinference.span.kind"] ?? ts.span_kind ?? "").toUpperCase();
          if ((kind === "TOOL" || kind === "RETRIEVER") && ts.attributes?.["output.value"]) {
            const out = String(ts.attributes["output.value"]);
            if (out && out.length > 10) contextParts.push(out);
          }
        }
        context = contextParts.join("\n---\n");
      }

      // ── Extract response ──
      response = "";
      try {
        const parsed = JSON.parse(output);
        // LangGraph output: { messages: [{ type: "ai", content: "..." }], docs: [...] }
        if (Array.isArray(parsed?.messages)) {
          const aiMsg = parsed.messages.find((m: any) => m.type === "ai" || m.role === "assistant");
          if (aiMsg?.content) response = String(aiMsg.content);
          // Also extract context from docs if available and context is empty
          if (!context && Array.isArray(parsed.docs)) {
            context = parsed.docs.map((d: any) => d.page_content ?? "").filter(Boolean).join("\n---\n");
          }
          // Also extract query from search_query
          if ((!query || query === root.name) && parsed.search_query) {
            query = String(parsed.search_query);
          }
        }
        // LangChain AIMessage: { kwargs: { content: "..." } }
        if (!response) {
          response = parsed?.kwargs?.content
            || parsed?.generations?.[0]?.[0]?.text
            || parsed?.output
            || parsed?.content
            || "";
        }
      } catch { /* plain-text output — not JSON, fallback below */ }
      if (!response && output && !output.startsWith("{")) response = output;
      if (!response) response = output;
    }

    if (!query && !response) continue;

    // Detect any triggered guardrail across all spans of this trace. Cheap
    // linear scan — guardrail spans are rare and check is per-trace, not
    // per-render. When no GUARDRAIL spans exist this is false.
    const hasGuardrailTriggered = allSpans.some((ts) => {
      if (ts.context?.trace_id !== traceId) return false;
      const kind = String(
        ts.attributes?.["openinference.span.kind"] ?? ts.span_kind ?? "",
      ).toUpperCase();
      return kind === "GUARDRAIL" && ts.attributes?.["guardrail.triggered"] === true;
    });

    results.push({
      spanId: sid,
      traceId,
      time: root.start_time,
      latency: root.end_time
        ? new Date(root.end_time).getTime() - new Date(root.start_time).getTime()
        : 0,
      query,
      context,
      response,
      annotations: mergeTraceAnnotations(traceId, allSpans, annMap),
      promptTokens: Number(root.attributes?.["llm.token_count.prompt"] ?? 0),
      completionTokens: Number(root.attributes?.["llm.token_count.completion"] ?? 0),
      totalTokens: Number(root.attributes?.["llm.token_count.total"] ?? 0),
      model: String(root.attributes?.["llm.model_name"] ?? ""),
      status: String(root.status_code ?? "OK"),
      spanKind: String(root.span_kind ?? ""),
      hasGuardrailTriggered,
    });
  }

  // Sort by time descending (newest first)
  results.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return results;
}

export async function fetchTraceTrees(
  projectName: string,
  startTime?: string,
  endTime?: string,
): Promise<TraceTree[]> {
  const { allSpans, annMap } = await fetchSpansAndAnnotations(projectName, startTime, endTime);
  return buildTraceTrees(allSpans, annMap);
}

/** Build TraceTree[] from already-fetched spans. Split out from fetchTraceTrees
 *  so paginating callers can accumulate spans across pages and rebuild. */
export function buildTraceTrees(
  allSpans: any[],
  annMap: Record<string, Annotation[]>,
): TraceTree[] {
  // Group by trace
  const traceGroups: Record<string, any[]> = {};
  for (const s of allSpans) {
    const tid = s.context?.trace_id;
    if (tid) {
      if (!traceGroups[tid]) traceGroups[tid] = [];
      traceGroups[tid].push(s);
    }
  }

  // Build trees
  const trees: TraceTree[] = [];
  for (const [traceId, spans] of Object.entries(traceGroups)) {
    const roots = buildSpanTree(spans, annMap);
    if (roots.length === 0) continue;

    // Find the actual root (no parent)
    const root = roots.find((r) => r.parentId === null) ?? roots[0];
    const rootStart = spans.find((s) => s.parent_id === null)?.start_time;

    trees.push({
      traceId,
      rootSpan: root,
      spanCount: spans.length,
      latency: root.latency,
      time: rootStart ?? spans[0]?.start_time ?? "",
      hasGuardrailTriggered: computeHasGuardrailTriggered(root),
    });
  }

  // Sort by time descending
  trees.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return trees;
}

export async function deleteTrace(traceId: string): Promise<void> {
  await apiFetch(
    `/api/v1/traces/${encodeURIComponent(traceId)}`,
    { method: "DELETE" },
  );
}
