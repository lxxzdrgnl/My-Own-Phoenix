// lib/query/parser.ts
//
// Hand-written tokenizer (no regex — ReDoS-safe per spec security section).
// Symmetric serializer round-trips the AST back to canonical text so the
// query bar and chip row stay in sync via a single source of truth.

import {
  ALL_STATIC_FIELDS,
  ENUM_VALUES,
  formatNumericValue,
  parseNumericValue,
  STATIC_ENUM_FIELDS,
  STATIC_NUMERIC_FIELDS,
  STATIC_TEXT_FIELDS,
} from "./fields";
import type {
  AnnotationToken,
  AnnotationValue,
  AnnotatorScope,
  EnumField,
  ErrorToken,
  FreeTextToken,
  NumericField,
  ParseResult,
  QueryAST,
  TextField,
  Token,
} from "./types";
import { MAX_QUERY_LENGTH, MAX_TOKENS } from "./types";

const ANNOTATION_VALUES = new Set<string>(["pass", "fail", "none"]);
const ANNOTATOR_SUFFIXES = new Set<string>(["ai", "human", "diff"]);

/** Split the input into raw word chunks, honoring "quoted" sections. */
function splitWords(input: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      buf += c;
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (c === " " || c === "\t" || c === "\n")) {
      if (buf.length > 0) {
        out.push(buf);
        buf = "";
      }
      continue;
    }
    buf += c;
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

export function parseQuery(
  rawInput: string,
  knownAnnotations: ReadonlySet<string>,
): ParseResult {
  if (rawInput.length > MAX_QUERY_LENGTH) {
    const err: ErrorToken = {
      kind: "error",
      raw: rawInput.slice(0, 32) + "…",
      message: `Query too long (${rawInput.length} > ${MAX_QUERY_LENGTH})`,
    };
    return {
      ast: { tokens: [err], annotationCombinator: "AND" },
      errors: [err],
    };
  }

  let input = rawInput;
  let combinator: "AND" | "OR" = "AND";

  // Strip leading "or:" / "and:" marker.
  const trimmed = input.trimStart();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("or:")) {
    combinator = "OR";
    input = trimmed.slice(3).trimStart();
  } else if (lower.startsWith("and:")) {
    combinator = "AND";
    input = trimmed.slice(4).trimStart();
  }

  const words = splitWords(input);
  const tokens: Token[] = [];
  const errors: ErrorToken[] = [];

  for (const word of words) {
    if (tokens.length >= MAX_TOKENS) {
      const err: ErrorToken = {
        kind: "error",
        raw: word,
        message: `Too many tokens (>${MAX_TOKENS})`,
      };
      tokens.push(err);
      errors.push(err);
      break;
    }
    const token = parseWord(word, knownAnnotations);
    if (token.kind === "error") errors.push(token);
    tokens.push(token);
  }

  return {
    ast: { tokens, annotationCombinator: combinator },
    errors,
  };
}

function parseWord(
  word: string,
  knownAnnotations: ReadonlySet<string>,
): Token {
  // Negation prefix.
  let negate = false;
  let body = word;
  if (body.startsWith("-") && body.length > 1) {
    negate = true;
    body = body.slice(1);
  }

  // Quoted -> always free text (colons preserved literally).
  if (body.startsWith('"') && body.endsWith('"') && body.length >= 2) {
    const inner = body.slice(1, -1);
    const t: FreeTextToken = {
      kind: "freetext",
      text: inner.toLowerCase(),
      negate,
      raw: word,
    };
    return t;
  }

  const colonIdx = body.indexOf(":");
  if (colonIdx <= 0 || colonIdx === body.length - 1) {
    // No colon, or leading/trailing colon -> free text.
    return {
      kind: "freetext",
      text: body.toLowerCase(),
      negate,
      raw: word,
    };
  }

  const rawKey = body.slice(0, colonIdx);
  const value = body.slice(colonIdx + 1);

  // Annotator suffix: "<name>.<suffix>"
  let key = rawKey;
  let annotatorScope: AnnotatorScope | undefined;
  const dotIdx = rawKey.lastIndexOf(".");
  if (dotIdx > 0 && dotIdx < rawKey.length - 1) {
    const suffix = rawKey.slice(dotIdx + 1).toLowerCase();
    if (ANNOTATOR_SUFFIXES.has(suffix)) {
      key = rawKey.slice(0, dotIdx);
      annotatorScope = suffix as AnnotatorScope;
    }
  }

  const keyLower = key.toLowerCase();

  // Static numeric.
  if (STATIC_NUMERIC_FIELDS.has(keyLower as NumericField)) {
    const parsed = parseNumericValue(keyLower as NumericField, value);
    if (!parsed) {
      return {
        kind: "error",
        raw: word,
        message: `Invalid ${keyLower} value: "${value}"`,
      };
    }
    return {
      kind: "numeric",
      field: keyLower as NumericField,
      op: parsed.op,
      value: parsed.value,
      negate,
      raw: word,
    };
  }

  // Static enum.
  if (STATIC_ENUM_FIELDS.has(keyLower as EnumField)) {
    const field = keyLower as EnumField;
    const values = value
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v.length > 0);
    if (values.length === 0) {
      return {
        kind: "error",
        raw: word,
        message: `Empty ${field} value`,
      };
    }
    const allowed = ENUM_VALUES[field];
    if (allowed.size > 0) {
      for (const v of values) {
        if (!allowed.has(v)) {
          return {
            kind: "error",
            raw: word,
            message: `Invalid ${field} value: "${v}"`,
          };
        }
      }
    }
    return { kind: "enum", field, values, negate, raw: word };
  }

  // Static text.
  if (STATIC_TEXT_FIELDS.has(keyLower as TextField)) {
    return {
      kind: "text",
      field: keyLower as TextField,
      value: value.toLowerCase(),
      negate,
      raw: word,
    };
  }

  // Annotation (case-insensitive match against project-known names).
  if (isKnownAnnotation(key, knownAnnotations)) {
    const values = value
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v.length > 0);
    if (values.length === 0) {
      return {
        kind: "error",
        raw: word,
        message: `Empty annotation value for "${key}"`,
      };
    }
    for (const v of values) {
      if (!ANNOTATION_VALUES.has(v)) {
        return {
          kind: "error",
          raw: word,
          message: `Invalid annotation value: "${v}" (use pass/fail/none)`,
        };
      }
    }
    const t: AnnotationToken = {
      kind: "annotation",
      name: canonicalAnnotationName(key, knownAnnotations),
      annotatorScope,
      values: values as AnnotationValue[],
      negate,
      raw: word,
    };
    return t;
  }

  // Unknown field.
  return {
    kind: "error",
    raw: word,
    message: `Unknown field "${key}"`,
  };
}

function isKnownAnnotation(
  name: string,
  known: ReadonlySet<string>,
): boolean {
  if (ALL_STATIC_FIELDS.has(name.toLowerCase())) return false;
  for (const k of known) {
    if (k.toLowerCase() === name.toLowerCase()) return true;
  }
  return false;
}

function canonicalAnnotationName(
  name: string,
  known: ReadonlySet<string>,
): string {
  for (const k of known) {
    if (k.toLowerCase() === name.toLowerCase()) return k;
  }
  return name;
}

// ─── Serializer ──────────────────────────────────────────────────────────────

export function serializeQuery(ast: QueryAST): string {
  const parts: string[] = [];
  if (ast.annotationCombinator === "OR") parts.push("or:");

  // Merge identical annotation tokens by union of values (so chips can toggle
  // pass+fail without producing duplicate text fragments).
  const merged = mergeAnnotationTokens(ast.tokens);

  for (const tok of merged) {
    parts.push(serializeToken(tok));
  }
  return parts.join(" ");
}

function mergeAnnotationTokens(tokens: Token[]): Token[] {
  const seen = new Map<string, AnnotationToken>();
  const out: Token[] = [];
  for (const tok of tokens) {
    if (tok.kind !== "annotation") {
      out.push(tok);
      continue;
    }
    const key = `${tok.negate ? "-" : ""}${tok.name.toLowerCase()}${tok.annotatorScope ? "." + tok.annotatorScope : ""}`;
    const existing = seen.get(key);
    if (existing) {
      for (const v of tok.values) {
        if (!existing.values.includes(v)) existing.values.push(v);
      }
    } else {
      const copy: AnnotationToken = { ...tok, values: [...tok.values] };
      seen.set(key, copy);
      out.push(copy);
    }
  }
  return out;
}

function serializeToken(tok: Token): string {
  const neg = "negate" in tok && tok.negate ? "-" : "";
  switch (tok.kind) {
    case "annotation": {
      const suffix = tok.annotatorScope ? "." + tok.annotatorScope : "";
      return `${neg}${tok.name}${suffix}:${tok.values.join(",")}`;
    }
    case "numeric":
      return `${neg}${tok.field}:${formatNumericValue(tok.field, tok.op, tok.value)}`;
    case "enum":
      return `${neg}${tok.field}:${tok.values.join(",")}`;
    case "text":
      return `${neg}${tok.field}:${tok.value}`;
    case "freetext": {
      const needsQuotes = tok.text.includes(" ") || tok.text.includes(":");
      const body = needsQuotes ? `"${tok.text}"` : tok.text;
      return `${neg}${body}`;
    }
    case "error":
      return tok.raw;
  }
}
