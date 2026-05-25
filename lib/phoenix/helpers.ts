import { apiFetch } from "@/lib/api-client";
import { parseGuardrailDetections } from "./guardrail";
import type { Annotation, RawSpan } from "./types";

/** Normalize content that can be string or [{type, text}] array */
export function normalizeContent(content: string | { type: string; text: string }[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => c.text).join("\n");
  return String(content ?? "");
}

export function extractTag(input: string, tag: string): string {
  try {
    const data = JSON.parse(input);
    for (const msg of data.messages?.[0] ?? []) {
      const content = msg.kwargs?.content ?? "";
      const m = content.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      if (m) return m[1].trim();
    }
  } catch (e) { console.error(e); }
  return "";
}

export function extractResponse(output: string): string {
  try {
    return JSON.parse(output).generations[0][0].text;
  } catch (e) { console.error(e); }
  return "";
}

// ─── Shared: fetch spans + annotations ─────────────────────────────────────

export async function fetchSpansAndAnnotations(
  projectName: string,
  startTime?: string,
  endTime?: string,
): Promise<{ allSpans: any[]; annMap: Record<string, Annotation[]> }> {
  let spansUrl = `/api/v1/projects/${encodeURIComponent(projectName)}/spans?limit=1000`;
  if (startTime) spansUrl += `&start_time=${encodeURIComponent(startTime)}`;
  if (endTime) spansUrl += `&end_time=${encodeURIComponent(endTime)}`;

  const spansRes = await apiFetch(spansUrl);
  const spansData = await spansRes.json();
  const allSpans: any[] = spansData.data ?? [];

  // Fetch annotations in batches of 50
  const allIds = allSpans.map((s) => s.context?.span_id).filter(Boolean) as string[];
  const annMap: Record<string, Annotation[]> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < allIds.length; i += 50) chunks.push(allIds.slice(i, i + 50));

  await Promise.all(
    chunks.map((ids) => {
      const params = ids.map((id) => `span_ids=${id}`).join("&");
      return apiFetch(
        `/api/v1/projects/${encodeURIComponent(projectName)}/span_annotations?${params}&limit=1000`,
      )
        .then((r) => r.json())
        .then((data) => {
          for (const a of data.data ?? []) {
            if (!annMap[a.span_id]) annMap[a.span_id] = [];
            annMap[a.span_id].push({
              name: a.name,
              label: a.result?.label ?? "",
              score: a.result?.score ?? 0,
              annotatorKind: a.annotator_kind ?? undefined,
              explanation: a.result?.explanation ?? "",
            });
          }
        })
        .catch(() => {});
    }),
  );

  return { allSpans, annMap };
}

/** Merge all annotations from a trace's spans into one list.
 *  Deduplicated by (name, annotatorKind) so AI and HUMAN annotations on the
 *  same eval are both preserved — required by the human-review comparison
 *  and consumed by callers that key on `${name}-${annotatorKind}`. */
export function mergeTraceAnnotations(traceId: string, allSpans: any[], annMap: Record<string, Annotation[]>): Annotation[] {
  const traceSpanIds = allSpans
    .filter((s) => s.context?.trace_id === traceId)
    .sort((a, b) => (a.parent_id === null ? -1 : 1)) // root first
    .map((s) => s.context.span_id as string);

  const merged: Annotation[] = [];
  const seen = new Set<string>();
  for (const sid of traceSpanIds) {
    for (const ann of annMap[sid] ?? []) {
      const key = `${ann.name}|${ann.annotatorKind ?? "LLM"}`;
      if (!seen.has(key)) {
        merged.push(ann);
        seen.add(key);
      }
    }
  }
  return merged;
}

export function buildSpanTree(rawSpans: any[], annMap: Record<string, Annotation[]>): RawSpan[] {
  const spanMap = new Map<string, RawSpan>();
  const roots: RawSpan[] = [];

  // Create RawSpan objects
  for (const s of rawSpans) {
    const sid = s.context?.span_id ?? "";
    const attrs = s.attributes ?? {};
    const promptTokens = Number(attrs["llm.token_count.prompt"] ?? 0);
    const completionTokens = Number(attrs["llm.token_count.completion"] ?? 0);
    const totalTokens = Number(attrs["llm.token_count.total"] ?? 0);

    const spanKindStr = String(attrs["openinference.span.kind"] ?? s.span_kind ?? "");
    const span: RawSpan = {
      spanId: sid,
      traceId: s.context?.trace_id ?? "",
      parentId: s.parent_id ?? null,
      name: s.name ?? "",
      spanKind: spanKindStr,
      status: String(s.status_code ?? "OK"),
      latency: s.end_time && s.start_time
        ? new Date(s.end_time).getTime() - new Date(s.start_time).getTime()
        : 0,
      input: String(attrs["input.value"] ?? ""),
      output: String(attrs["output.value"] ?? ""),
      model: String(attrs["llm.model_name"] ?? ""),
      promptTokens,
      completionTokens,
      totalTokens,
      cost: 0,
      annotations: annMap[sid] ?? [],
      children: [],
    };

    // Populate guardrail fields only when this is a GUARDRAIL span. Keeps
    // the field absent for normal spans so downstream `?? false` checks
    // are unambiguous.
    if (spanKindStr.toUpperCase() === "GUARDRAIL") {
      span.guardrailTriggered = attrs["guardrail.triggered"] === true;
      const gt = attrs["guardrail.type"];
      if (typeof gt === "string") span.guardrailType = gt;
      span.guardrailDetections = parseGuardrailDetections(attrs["guardrail.detections"]);
    }

    spanMap.set(sid, span);
  }

  // Build tree
  for (const span of spanMap.values()) {
    if (span.parentId && spanMap.has(span.parentId)) {
      spanMap.get(span.parentId)!.children.push(span);
    } else {
      roots.push(span);
    }
  }

  // Merge all descendant annotations into root spans — keyed by
  // (name, annotatorKind) so AI and HUMAN annotations on the same eval are
  // both bubbled up (needed by human-review pairs and per-kind badge keys).
  for (const root of roots) {
    const keyOf = (a: Annotation) => `${a.name}|${a.annotatorKind ?? "LLM"}`;
    const existing = new Set(root.annotations.map(keyOf));
    function collectAnnotations(node: RawSpan) {
      for (const ann of node.annotations) {
        const k = keyOf(ann);
        if (!existing.has(k)) {
          root.annotations.push(ann);
          existing.add(k);
        }
      }
      for (const child of node.children) collectAnnotations(child);
    }
    for (const child of root.children) collectAnnotations(child);
  }

  return roots;
}
