// ─── Shared types for lib/phoenix modules ────────────────────────────────────
// No imports from other lib/phoenix modules (prevents circular deps).

export interface Trace {
  spanId: string;
  traceId: string;
  time: string;
  latency: number;
  query: string;
  context: string;
  response: string;
  annotations: Annotation[];
  // Span metadata for MEASURE metrics
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  status: string;
  spanKind: string;
  /** True when this trace contains ≥1 GUARDRAIL span with `guardrail.triggered=true`. */
  hasGuardrailTriggered?: boolean;
}

export interface GuardrailDetection {
  type: string;
  start: number;
  end: number;
  masked: string;
}

export interface Annotation {
  name: string;
  label: string;
  score: number;
  annotatorKind?: "LLM" | "HUMAN";
  /** Optional free-text explanation/comment attached to the annotation. */
  explanation?: string;
}

export interface PromptVersion {
  id: string;
  description: string;
  model_provider: string;
  model_name: string;
  template: {
    type: string;
    messages: { role: string; content: string | { type: string; text: string }[] }[];
  };
  template_format: string;
  invocation_parameters: {
    type: string;
    openai?: { temperature?: number };
  };
}

export interface PromptInfo {
  id: string;
  name: string;
  description: string;
}

export interface ComparisonResult {
  label: string;
  text: string;
  tokens: number;
  loading: boolean;
  error?: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface RawSpan {
  spanId: string;
  traceId: string;
  parentId: string | null;
  name: string;
  spanKind: string;
  status: string;
  latency: number;
  input: string;
  output: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  annotations: Annotation[];
  children: RawSpan[];
  // ─── Guardrail (only set when spanKind === "GUARDRAIL") ───
  /** True if the guard fired (PII detected / blocked / etc). */
  guardrailTriggered?: boolean;
  /** Guard subtype, e.g. "pii_mask". */
  guardrailType?: string;
  /** Parsed `guardrail.detections` array. */
  guardrailDetections?: GuardrailDetection[];
}

export interface TraceTree {
  traceId: string;
  rootSpan: RawSpan;
  spanCount: number;
  latency: number;
  time: string;
  /** True when this trace contains ≥1 GUARDRAIL span with `guardrail.triggered=true`. */
  hasGuardrailTriggered?: boolean;
}

export interface PromptTag {
  name: string;
}
