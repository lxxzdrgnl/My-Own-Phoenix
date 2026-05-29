// ─── lib/phoenix barrel ──────────────────────────────────────────────────────
// All 22 external callers import from "@/lib/phoenix" — this file re-exports
// everything so those import paths need no changes.

export type {
  Trace,
  GuardrailDetection,
  Annotation,
  PromptVersion,
  PromptInfo,
  ComparisonResult,
  Project,
  RawSpan,
  TraceTree,
  PromptTag,
} from "./types";

export {
  parseGuardrailDetections,
  computeHasGuardrailTriggered,
} from "./guardrail";

export { normalizeContent, fetchSpansAndAnnotations } from "./helpers";

export { fetchProjects } from "./projects";

export {
  fetchTraces,
  fetchTraceTrees,
  buildTraces,
  buildTraceTrees,
  deleteTrace,
} from "./traces";

export {
  fetchPrompts,
  fetchPromptVersions,
  fetchPromptsWithVersions,
  fetchScopedPromptsWithVersions,
  fetchPromptVersionTags,
  addPromptVersionTag,
  deletePromptVersionTag,
  createPrompt,
  updatePrompt,
  deletePrompt,
} from "./prompts";

export { callLLM } from "./llm";
