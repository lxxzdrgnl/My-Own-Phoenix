// lib/query/types.ts
//
// Type definitions for the traces query AST.
//
// A query like:
//   "or: hallucination:pass citation:fail latency:>3s"
// parses to:
//   {
//     tokens: [
//       { kind: "annotation", name: "hallucination", values: ["pass"], ... },
//       { kind: "annotation", name: "citation",      values: ["fail"], ... },
//       { kind: "numeric",    field: "latency", op: ">", value: 3000, ... },
//     ],
//     annotationCombinator: "OR",
//   }
//
// applyFilters(traces, ast) then walks each trace and ANDs / ORs accordingly.

export type AnnotatorScope = "ai" | "human" | "diff";

export type AnnotationValue = "pass" | "fail" | "none";

export type NumericField = "latency" | "cost" | "tokens";
export type EnumField = "status" | "feedback" | "spanKind";
export type TextField = "model" | "name";

export type NumericOp = ">" | "<" | "between";

export interface AnnotationToken {
  kind: "annotation";
  /** Canonical annotation name (case-preserved from input). */
  name: string;
  /** `.ai` / `.human` / `.diff` suffix if user provided one; undefined otherwise. */
  annotatorScope?: AnnotatorScope;
  /** OR-ed list of pass/fail/none. Always non-empty after parsing. */
  values: AnnotationValue[];
  negate: boolean;
  /** Original raw text for UI display / error highlighting. */
  raw: string;
}

export interface NumericToken {
  kind: "numeric";
  field: NumericField;
  op: NumericOp;
  /** Single value for ">" / "<"; [min, max] inclusive tuple for "between". */
  value: number | [number, number];
  negate: boolean;
  raw: string;
}

export interface EnumToken {
  kind: "enum";
  field: EnumField;
  /** OR-ed list of allowed values, normalized to lowercase. */
  values: string[];
  negate: boolean;
  raw: string;
}

export interface TextToken {
  kind: "text";
  field: TextField;
  /** Lowercase substring to match. */
  value: string;
  negate: boolean;
  raw: string;
}

export interface FreeTextToken {
  kind: "freetext";
  /** Already lowercased. */
  text: string;
  negate: boolean;
  raw: string;
}

export interface ErrorToken {
  kind: "error";
  raw: string;
  message: string;
}

export type Token =
  | AnnotationToken
  | NumericToken
  | EnumToken
  | TextToken
  | FreeTextToken
  | ErrorToken;

export interface QueryAST {
  tokens: Token[];
  annotationCombinator: "AND" | "OR";
}

export interface ParseResult {
  ast: QueryAST;
  errors: ErrorToken[];
}

export const MAX_QUERY_LENGTH = 1000;
export const MAX_TOKENS = 50;
