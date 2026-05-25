import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callLlm } from "@/lib/llm-providers";
import { PASS_LABELS } from "@/lib/constants";
import { authedHandler, apiError, ErrorCode, validateFields } from "@/lib/api-error";
import { requireProjectMember } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";
import { PHOENIX_FETCH_TIMEOUT_MS, DEFAULT_API_TIMEOUT_MS } from "@/lib/config/timeouts";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

// ── Helpers ──

async function phoenixGetSpans(project: string, startTime: string, endTime: string) {
  const params = new URLSearchParams({ limit: "200", start_time: startTime, end_time: endTime });
  const res = await fetch(`${PHOENIX}/v1/projects/${project}/spans?${params}`, { signal: AbortSignal.timeout(PHOENIX_FETCH_TIMEOUT_MS) });
  const data = await res.json();
  return (data.data ?? []) as Record<string, unknown>[];
}

async function phoenixGetAnnotations(project: string, spanIds: string[]): Promise<Record<string, Set<string>>> {
  if (!spanIds.length) return {};
  const params = new URLSearchParams();
  spanIds.slice(0, 100).forEach((id) => params.append("span_ids", id));
  params.set("limit", "1000");
  const res = await fetch(`${PHOENIX}/v1/projects/${project}/span_annotations?${params}`, { signal: AbortSignal.timeout(DEFAULT_API_TIMEOUT_MS) });
  const data = await res.json();
  const result: Record<string, Set<string>> = {};
  for (const a of data.data ?? []) {
    if (!result[a.span_id]) result[a.span_id] = new Set();
    result[a.span_id].add(a.name);
  }
  return result;
}

async function phoenixUploadAnnotation(spanId: string, name: string, kind: string, label: string, score: number, explanation: string) {
  await fetch(`${PHOENIX}/v1/span_annotations?sync=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [{ span_id: spanId, name, annotator_kind: kind, result: { label, score, explanation } }],
    }),
    signal: AbortSignal.timeout(DEFAULT_API_TIMEOUT_MS),
  });
}

async function llmEval(messages: { role: string; content: string }[], model: string, opts?: { userId?: string; projectId?: string }): Promise<Record<string, unknown>> {
  try {
    const result = await callLlm({
      model,
      messages,
      temperature: 0,
      responseFormat: "json",
      ...opts,
    });
    return JSON.parse(result.content || "{}");
  } catch {
    return {};
  }
}

import { extractText, extractQuery, extractContext } from "@/lib/span-extraction";

function splitPromptForSystem(template: string): { system: string | null; user: string } {
  const lines = template.split("\n");
  const dataStart = lines.findIndex((l) => ["CONTEXT:", "QUERY:", "RESPONSE:"].includes(l.trim()));
  if (dataStart <= 0) return { system: null, user: template };
  return { system: lines.slice(0, dataStart).join("\n").trim(), user: lines.slice(dataStart).join("\n").trim() };
}

// ── Code-rule evaluator (parity with eval-worker/worker.py:_eval_code_rule) ──

type RuleResult = { label: string; score: number; explanation: string };

interface CodeRule {
  check: string;
  op: string;
  value: string;
  caseSensitive?: boolean;
}

interface RuleConfig {
  rules: CodeRule[];
  logic?: "any" | "all";
  match?: { label?: string; score?: number };
  clean?: { label?: string; score?: number };
}

function spanLatencyMs(span: Record<string, unknown>): number {
  const start = String(span.start_time ?? "");
  const end = String(span.end_time ?? "");
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isFinite(s) && Number.isFinite(e)) return Math.max(0, e - s);
  return 0;
}

function runCodeRule(
  ruleConfig: RuleConfig,
  query: string,
  response: string,
  context: string,
  span: Record<string, unknown>,
): RuleResult {
  const rules = ruleConfig.rules ?? [];
  const logic = ruleConfig.logic ?? "any";
  const matchRes = ruleConfig.match ?? { label: "detected", score: 1.0 };
  const cleanRes = ruleConfig.clean ?? { label: "clean", score: 0.0 };

  const attrs = (span.attributes ?? {}) as Record<string, unknown>;
  const fieldValues: Record<string, string | number> = {
    response,
    query,
    context,
    total_tokens: Number(attrs["llm.token_count.total"] ?? 0) || 0,
    prompt_tokens: Number(attrs["llm.token_count.prompt"] ?? 0) || 0,
    completion_tokens: Number(attrs["llm.token_count.completion"] ?? 0) || 0,
    latency_ms: spanLatencyMs(span),
    cost: 0,
    model_name: String(attrs["llm.model_name"] ?? ""),
    status: String(span.status_code ?? "OK"),
    span_kind: String(attrs["openinference.span.kind"] ?? ""),
  };

  const results: boolean[] = [];
  for (const rule of rules) {
    const checkField = rule.check ?? "response";
    const op = rule.op ?? "contains_any";
    const value = rule.value ?? "";
    const caseSensitive = !!rule.caseSensitive;
    const fieldVal = fieldValues[checkField] ?? "";
    let matched = false;

    try {
      if (typeof fieldVal === "string") {
        const text = caseSensitive ? fieldVal : fieldVal.toLowerCase();
        const cmpVal = caseSensitive ? value : value.toLowerCase();

        if (op === "contains_any") {
          const kws = cmpVal.split(",").map((k) => k.trim()).filter(Boolean);
          matched = kws.some((k) => text.includes(k));
        } else if (op === "not_contains_any") {
          const kws = cmpVal.split(",").map((k) => k.trim()).filter(Boolean);
          matched = !kws.some((k) => text.includes(k));
        } else if (op === "matches_regex") {
          const flags = caseSensitive ? "" : "i";
          matched = new RegExp(value, flags).test(fieldVal);
        } else if (op === "length_gt") {
          matched = fieldVal.length > Number(value);
        } else if (op === "length_lt") {
          matched = fieldVal.length < Number(value);
        } else if (op === "is_empty") {
          matched = fieldVal.trim().length === 0;
        } else if (op === "is_not_empty") {
          matched = fieldVal.trim().length > 0;
        } else if (op === "equals") {
          matched = text === cmpVal;
        } else if (op === "not_equals") {
          matched = text !== cmpVal;
        }
      } else {
        const num = Number(fieldVal);
        if (op === "gt") matched = num > Number(value);
        else if (op === "lt") matched = num < Number(value);
        else if (op === "gte") matched = num >= Number(value);
        else if (op === "lte") matched = num <= Number(value);
        else if (op === "between") {
          const parts = value.split(",").map((v) => v.trim());
          if (parts.length === 2) matched = Number(parts[0]) <= num && num <= Number(parts[1]);
        } else if (op === "equals") matched = num === Number(value);
      }
    } catch {
      // Bad regex / number — treat as non-match.
    }

    results.push(matched);
  }

  const triggered = results.length === 0 ? false : logic === "all" ? results.every(Boolean) : results.some(Boolean);

  if (triggered) {
    return {
      label: matchRes.label ?? "detected",
      score: Number(matchRes.score ?? 1.0),
      explanation: "Rule matched",
    };
  }
  return {
    label: cleanRes.label ?? "clean",
    score: Number(cleanRes.score ?? 0.0),
    explanation: "",
  };
}

// ── POST /api/eval-backfill ──

export const POST = authedHandler(async (req: NextRequest, uid: string) => {
  const { projectId, evalName, startDate, endDate } = (await req.json()) as {
    projectId: string;
    evalName: string;
    startDate: string;
    endDate: string;
  };

  const err = validateFields([
    { field: "projectId", value: projectId, required: true },
    { field: "evalName", value: evalName, required: true },
    { field: "startDate", value: startDate, required: true },
    { field: "endDate", value: endDate, required: true },
  ]);
  if (err) return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", err);

  if (uid !== "internal-service") {
    const roleCheck = await requireProjectMember(req, projectId, uid, "editor");
    if (roleCheck instanceof NextResponse) return roleCheck;
  }

  // Resolve the Phoenix project name for trace/annotation calls (Phoenix doesn't know cuids).
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { phoenixProject: true },
  });
  const phoenixProject = project?.phoenixProject;
  if (!phoenixProject) {
    return apiError(req, ErrorCode.BAD_REQUEST, "Project has no phoenixProject mapping");
  }

  // Load eval definition
  const evalPrompt = await prisma.evalPrompt.findFirst({
    where: { name: evalName, OR: [{ projectId: null }, { projectId: "" }, { projectId }] },
  });
  if (!evalPrompt) {
    return apiError(req, ErrorCode.EVAL_NOT_FOUND, `Eval "${evalName}" not found`);
  }

  const evalType = evalPrompt.evalType ?? "llm";
  const isCodeRule = evalType === "code_rule";

  // Validate: LLM evals need a template; code_rule evals need a ruleConfig.
  if (!isCodeRule && !evalPrompt.template) {
    return apiError(req, ErrorCode.EVAL_NOT_FOUND, `Eval "${evalName}" has no template`);
  }
  let ruleConfig: RuleConfig | null = null;
  if (isCodeRule) {
    try {
      ruleConfig = JSON.parse(evalPrompt.ruleConfig ?? "{}") as RuleConfig;
    } catch {
      return apiError(req, ErrorCode.BAD_REQUEST, `Eval "${evalName}" has invalid ruleConfig`);
    }
    if (!ruleConfig?.rules?.length) {
      return apiError(req, ErrorCode.BAD_REQUEST, `Eval "${evalName}" has no rules configured`);
    }
  }

  const startTime = new Date(startDate).toISOString();
  const endTime = new Date(endDate + "T23:59:59Z").toISOString();
  const outputMode = evalPrompt.outputMode ?? "score";

  // Fetch spans
  const spans = await phoenixGetSpans(phoenixProject, startTime, endTime);
  if (!spans.length) {
    return NextResponse.json({ evaluated: 0, skipped: 0, message: "No spans found in date range" });
  }

  // Group by trace, find root spans
  const traces: Record<string, Record<string, unknown>[]> = {};
  for (const s of spans) {
    const tid = (s.context as Record<string, string>)?.trace_id;
    if (tid) {
      if (!traces[tid]) traces[tid] = [];
      traces[tid].push(s);
    }
  }

  // Get existing annotations for root spans
  const rootSpans: Record<string, Record<string, unknown>> = {};
  for (const [tid, tspans] of Object.entries(traces)) {
    const root = tspans.find((s) => s.parent_id === null || s.parent_id === undefined);
    if (root) rootSpans[tid] = root;
  }
  const rootIds = Object.values(rootSpans).map((s) => (s.context as Record<string, string>).span_id);
  const existing = await phoenixGetAnnotations(phoenixProject, rootIds);

  let evaluated = 0;
  let skipped = 0;

  for (const [tid, root] of Object.entries(rootSpans)) {
    const spanId = (root.context as Record<string, string>).span_id;

    const attrs = (root.attributes ?? {}) as Record<string, unknown>;
    const rawInput = String(attrs["input.value"] ?? "");
    const rawOutput = String(attrs["output.value"] ?? "");
    const query = extractQuery(rawInput);
    const response = extractText(rawOutput);

    if (!query && !response) {
      skipped++;
      continue;
    }

    // Aggregate context from sibling TOOL/RETRIEVER spans
    let context = extractContext(rawInput);
    if (!context) {
      const siblings = traces[tid] ?? [];
      const parts: string[] = [];
      for (const s of siblings) {
        const kind = String((s.attributes as Record<string, unknown>)?.["openinference.span.kind"] ?? s.span_kind ?? "").toUpperCase();
        if (kind === "TOOL" || kind === "RETRIEVER") {
          const out = String((s.attributes as Record<string, unknown>)?.["output.value"] ?? "");
          if (out) parts.push(extractText(out));
        }
      }
      context = parts.join("\n---\n");
    }

    // Run eval — branch by evalType
    try {
      if (isCodeRule && ruleConfig) {
        const r = runCodeRule(ruleConfig, query, response, context, root);
        await phoenixUploadAnnotation(spanId, evalName, "CODE", r.label, r.score, r.explanation);
        evaluated++;
      } else {
        const filled = evalPrompt.template
          .replace(/\{context\}/g, context || "(no context)")
          .replace(/\{response\}/g, response || "(no response)")
          .replace(/\{query\}/g, query || "(no query)");

        const { system, user } = splitPromptForSystem(filled);
        const messages: { role: string; content: string }[] = [];
        if (system) messages.push({ role: "system", content: system });
        messages.push({ role: "user", content: user });

        const r = await llmEval(messages, evalPrompt.model ?? "gpt-4o-mini", { userId: uid, projectId });
        if (r && r.label) {
          const label = String(r.label);
          let score: number;
          if (outputMode === "binary" || r.score === undefined) {
            score = PASS_LABELS.has(label.toLowerCase()) ? 1.0 : 0.0;
          } else {
            score = Number(r.score) || 0;
          }
          await phoenixUploadAnnotation(spanId, evalName, "LLM", label, score, String(r.explanation ?? ""));
          evaluated++;
        } else {
          skipped++;
        }
      }
    } catch (e) {
      logger.error("backfill eval failed for span", e, { route: "POST /api/eval-backfill", evalName, spanId });
      skipped++;
    }
  }

  return NextResponse.json({ evaluated, skipped, total: Object.keys(rootSpans).length });
});
