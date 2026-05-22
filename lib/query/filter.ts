// lib/query/filter.ts
//
// Pure filter engine: applies a parsed QueryAST to a list of Trace records.
// Error tokens are ignored (so a typo doesn't blow away the whole list).

import { FAIL_LABELS, PASS_LABELS } from "@/lib/constants";
import type { Annotation, Trace } from "@/lib/phoenix";
import type {
  AnnotationToken,
  EnumToken,
  FreeTextToken,
  NumericToken,
  QueryAST,
  TextToken,
  Token,
} from "./types";

/** Apply an AST to a list of traces. Error tokens are skipped. */
export function applyFilters(traces: Trace[], ast: QueryAST): Trace[] {
  if (ast.tokens.length === 0) return traces;

  const annotationTokens: AnnotationToken[] = [];
  const otherTokens: Token[] = [];
  for (const t of ast.tokens) {
    if (t.kind === "error") continue;
    if (t.kind === "annotation") annotationTokens.push(t);
    else otherTokens.push(t);
  }

  return traces.filter((tr) => {
    // Non-annotation tokens are always AND-combined.
    for (const tok of otherTokens) {
      if (!matchToken(tr, tok)) return false;
    }

    // Annotation tokens combine per the AST's combinator.
    if (annotationTokens.length === 0) return true;
    if (ast.annotationCombinator === "AND") {
      return annotationTokens.every((tok) => matchAnnotationToken(tr, tok));
    }
    return annotationTokens.some((tok) => matchAnnotationToken(tr, tok));
  });
}

function matchToken(tr: Trace, tok: Token): boolean {
  switch (tok.kind) {
    case "numeric":
      return matchNumeric(tr, tok);
    case "enum":
      return matchEnum(tr, tok);
    case "text":
      return matchText(tr, tok);
    case "freetext":
      return matchFreeText(tr, tok);
    case "annotation":
      return matchAnnotationToken(tr, tok);
    case "error":
      return true;
  }
}

function matchAnnotationToken(tr: Trace, tok: AnnotationToken): boolean {
  // TODO(spec #2 + #3 — annotation infrastructure): respect tok.annotatorScope
  //   (".ai" / ".human" / ".diff"). For now we accept the suffix in the parser
  //   but match against any annotation with the given name regardless of
  //   annotator_kind. Once spec #2 + #3 lands, filter `matching` by
  //   `annotation.annotatorKind === "LLM"` for ".ai" or `"HUMAN"` for ".human".
  //   The `.diff` suffix should match only when AI and HUMAN annotations
  //   disagree.
  const matching = tr.annotations.filter(
    (a) => a.name.toLowerCase() === tok.name.toLowerCase(),
  );

  const wantsNone = tok.values.includes("none");
  const wantsPass = tok.values.includes("pass");
  const wantsFail = tok.values.includes("fail");

  let hit = false;
  if (wantsNone && matching.length === 0) hit = true;
  if (!hit && matching.length > 0) {
    if (wantsPass && matching.some(isPass)) hit = true;
    if (!hit && wantsFail && matching.some(isFail)) hit = true;
  }

  return tok.negate ? !hit : hit;
}

function isPass(a: Annotation): boolean {
  const label = (a.label ?? "").toLowerCase();
  if (PASS_LABELS.has(label)) return true;
  if (FAIL_LABELS.has(label)) return false;
  return a.score >= 0.8;
}

function isFail(a: Annotation): boolean {
  const label = (a.label ?? "").toLowerCase();
  if (FAIL_LABELS.has(label)) return true;
  if (PASS_LABELS.has(label)) return false;
  return a.score < 0.8;
}

function matchNumeric(tr: Trace, tok: NumericToken): boolean {
  const n = numericFor(tr, tok.field);
  let hit = false;
  if (tok.op === ">") hit = n > (tok.value as number);
  else if (tok.op === "<") hit = n < (tok.value as number);
  else {
    const [lo, hi] = tok.value as [number, number];
    hit = n >= lo && n <= hi;
  }
  return tok.negate ? !hit : hit;
}

function numericFor(tr: Trace, field: NumericToken["field"]): number {
  if (field === "latency") return tr.latency;
  if (field === "tokens") return tr.totalTokens || 0;
  // Cost: not currently exposed on Trace. Default to 0; future spec can
  // surface per-trace cost rollup.
  return 0;
}

function matchEnum(tr: Trace, tok: EnumToken): boolean {
  let value: string;
  if (tok.field === "status") {
    value = (tr.status || "").toLowerCase();
  } else if (tok.field === "spanKind") {
    value = (tr.spanKind || "").toLowerCase();
  } else if (tok.field === "feedback") {
    // Feedback isn't on Trace today; treat as "none". Future spec hooks this up.
    value = "none";
  } else {
    value = "";
  }
  const hit = tok.values.includes(value);
  return tok.negate ? !hit : hit;
}

function matchText(tr: Trace, tok: TextToken): boolean {
  let haystack: string;
  if (tok.field === "model") haystack = (tr.model || "").toLowerCase();
  // Trace doesn't carry a top-level "name" field today (only spans do); treat
  // as empty so match fails cleanly. Future spec can derive from rootSpan.name.
  else haystack = "";
  const hit = haystack.includes(tok.value);
  return tok.negate ? !hit : hit;
}

function matchFreeText(tr: Trace, tok: FreeTextToken): boolean {
  const q = (tr.query || "").toLowerCase();
  const r = (tr.response || "").toLowerCase();
  const hit = q.includes(tok.text) || r.includes(tok.text);
  return tok.negate ? !hit : hit;
}
