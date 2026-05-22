# Traces Query Search UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the traces page's three ad-hoc filter states (`searchQuery`, `annotationFilter`, `latencyFilter`) with a GitHub-style `key:value` query language. A single AST drives both the query bar and the chip row; both stay in two-way sync. URL state (`?q=...`) shares views.

**Architecture:**
- `lib/query/` — pure modules: `parser.ts` (text <-> AST), `filter.ts` (AST applied to traces), `fields.ts` (field metadata).
- `components/query-bar/` — controlled inputs: query bar with debounced parse, chip row reading the same AST, optional autocomplete suggestions.
- `project-view.tsx` — owns one piece of state (`queryAST`), syncs it to URL via `useSearchParams` + `router.replace`.

**Tech Stack:** TypeScript, Next.js 16 App Router (`useSearchParams`, `useRouter` from `next/navigation`), React 19, Tailwind, `lucide-react` icons, `tsx` for running standalone parser/filter tests in `scripts/`.

---

## Design decisions (locked in here, applied throughout plan)

- **Parser:** hand-written tokenizer with cursor index, no regex (per spec security section, ReDoS-safe). Max length 1000 chars, max 50 tokens.
- **AST shape:** `{ tokens: Token[], annotationCombinator: "AND" | "OR" }`. Both sides round-trip-safe.
- **AST identity:** annotations are identified by their `name`. Static fields are: `latency`, `cost`, `tokens`, `status`, `feedback`, `model`, `name`, `spanKind`. All other `<word>:<value>` patterns are treated as annotation tokens **only if** the word matches a known annotation name (passed in as a Set from the project's traces); otherwise the token becomes an error token (still parsed, but flagged so UI can render red).
- **Annotator suffix:** parser accepts `<name>.diff`, `<name>.ai`, `<name>.human` as the annotation name part. Stored on the token as `annotatorKind: "ai" | "human" | "diff" | undefined`. **Filter ignores annotatorKind for now** (TODO: parallel spec #2 + #3 will implement). Both human and AI annotations are filtered the same way.
- **Pass/fail classification reuses `PASS_LABELS` and `FAIL_LABELS` from `lib/constants.ts`** to stay consistent with the existing filter logic. "none" = trace has no annotation with that name. Score >= 0.8 still counts as pass when label is unknown (same as the legacy logic).
- **Negation:** `-` prefix on any token. Stored as `negate: boolean` on the token.
- **Same field repeated:** parser keeps all occurrences (so chips can toggle pass+fail), but when serializing back, identical structural tokens are merged. Concretely: identical-name annotation tokens are merged by union of `values`. Other structural fields use last-wins per spec ("same field multiple times = last wins").
- **Free text:** any bare word or `"..."` quoted string is a `freetext` token. Quoted strings preserve colons. Multiple freetext tokens are AND-ed (each must match somewhere in `query` or `response`).
- **AND/OR semantics:** non-annotation tokens are AND. Annotation tokens are AND or OR according to `annotationCombinator` toggle. Different `values[]` inside one annotation token are always OR (e.g. `hallucination:pass,fail`).
- **URL state:** the entire query text is serialized as `?q=<encoded>`. We do **not** serialize the AND/OR toggle separately — it's encoded as a leading marker `or:` at the start of the query text (e.g. `or: hallucination:pass citation:fail`). Default is AND so no marker is needed.
- **No autocomplete in v1** — spec describes it but does not require it for the chip-driven UX. Plan defers autocomplete behind a clearly marked TODO. (Documented choice; chips give the user the same discoverability.)
- **Date range stays out of the query string** for now — it already has its own `DateRangePicker` and is orthogonal to the filter token language. (Spec calls this out as "verify and unify if needed"; we leave as-is to minimize blast radius.)
- **Trace tree filtering:** the filter engine is applied to the existing `traces: Trace[]` array. The `traceTrees: TraceTree[]` array is then filtered to the matching `traceId`s. This keeps the SpanTreeView unchanged and avoids touching trace-detail-view.tsx.

---

## File Structure

### To create
- `lib/query/types.ts` — shared `Token`, `QueryAST`, `ParseError` types.
- `lib/query/fields.ts` — static field metadata + value parsers (e.g. `>3s` -> ms, `0.01..0.1` -> `[number, number]`).
- `lib/query/parser.ts` — `parseQuery(text, knownAnnotations) -> QueryAST`, `serializeQuery(ast) -> text`.
- `lib/query/filter.ts` — `applyFilters(traces, ast) -> traces`, plus per-token predicates.
- `lib/query/index.ts` — barrel.
- `components/query-bar/query-bar.tsx` — controlled text input + parse-on-debounce.
- `components/query-bar/chip-row.tsx` — annotation chips + numeric chips + AND/OR toggle.
- `components/query-bar/index.ts` — barrel.
- `scripts/test-query-parser.ts` — standalone test harness (run via `tsx`).
- `scripts/test-query-filter.ts` — standalone test harness (run via `tsx`).

### To modify
- `app/projects/[name]/project-view.tsx` — replace 3 state hooks + filter logic with `queryAST` + URL sync; render `<QueryBar>` + `<ChipRow>` instead of the old search/filter panel.
- `lib/i18n/en.ts` — add query/chip-related strings.
- `lib/i18n/ko.ts` — add the same keys in Korean.

### Not touched
- `prisma/schema.prisma` (out of scope).
- `lib/sse-broadcast.ts` and other SSE files (different spec).
- `app/projects/[name]/traces/[traceId]/trace-detail-view.tsx` (out of scope).
- `lib/phoenix.ts` — read-only, we just consume `Trace`.
- `components/span-tree-view.tsx` — receives the same `TraceTree[]` shape, no changes.

---

## Task 1: Create `lib/query/types.ts`

**Files:**
- Create: `lib/query/types.ts`

- [ ] **Step 1: Write the types file**

```ts
// lib/query/types.ts

/** A negated token is excluded from matches. */
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
  /** `.ai` / `.human` / `.diff` suffix if user provided one; otherwise undefined. */
  annotatorScope?: AnnotatorScope;
  /** OR-ed list of pass/fail/none. Always non-empty after parsing. */
  values: AnnotationValue[];
  negate: boolean;
  /** Original text span, for error highlighting. */
  raw: string;
}

export interface NumericToken {
  kind: "numeric";
  field: NumericField;
  op: NumericOp;
  /** Single value for ">" / "<"; [min, max] tuple for "between" (inclusive). */
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
  /** Lowercase substring match. */
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/query/types.ts
git commit -m "feat(query): add Token + QueryAST type definitions"
```

---

## Task 2: Create `lib/query/fields.ts`

**Files:**
- Create: `lib/query/fields.ts`

- [ ] **Step 1: Write the fields module**

```ts
// lib/query/fields.ts
import type { EnumField, NumericField, TextField } from "./types";

export const STATIC_NUMERIC_FIELDS: ReadonlySet<NumericField> = new Set([
  "latency",
  "cost",
  "tokens",
]);

export const STATIC_ENUM_FIELDS: ReadonlySet<EnumField> = new Set([
  "status",
  "feedback",
  "spanKind",
]);

export const STATIC_TEXT_FIELDS: ReadonlySet<TextField> = new Set([
  "model",
  "name",
]);

export const ALL_STATIC_FIELDS: ReadonlySet<string> = new Set([
  ...STATIC_NUMERIC_FIELDS,
  ...STATIC_ENUM_FIELDS,
  ...STATIC_TEXT_FIELDS,
]);

/** Allowed enum values per field, lowercase. */
export const ENUM_VALUES: Record<EnumField, ReadonlySet<string>> = {
  status: new Set(["ok", "error"]),
  feedback: new Set(["up", "down", "none"]),
  // spanKind values are dynamic (any OpenInference kind), no whitelist.
  spanKind: new Set(),
};

/**
 * Parse a numeric value expression for `latency` / `cost` / `tokens`.
 * Returns { op, value } or null if invalid.
 *
 * Accepted forms (no regex — manual scan):
 *   ">3s"   ">3000"   "<1s"   "1s..3s"   "0.01..0.1"
 * Suffix handling per field:
 *   latency: "s" -> seconds (multiply by 1000), "ms" -> ms, no suffix -> ms.
 *   cost: no suffix -> USD as number.
 *   tokens: no suffix -> integer count.
 */
export function parseNumericValue(
  field: NumericField,
  raw: string,
):
  | { op: ">"; value: number }
  | { op: "<"; value: number }
  | { op: "between"; value: [number, number] }
  | null {
  if (raw.length === 0) return null;

  // Range form: "a..b"
  const rangeIdx = raw.indexOf("..");
  if (rangeIdx > 0 && rangeIdx < raw.length - 2) {
    const a = parseScalar(field, raw.slice(0, rangeIdx));
    const b = parseScalar(field, raw.slice(rangeIdx + 2));
    if (a === null || b === null) return null;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return { op: "between", value: [lo, hi] };
  }

  // Comparison form: ">x" / "<x"
  if (raw[0] === ">") {
    const n = parseScalar(field, raw.slice(1));
    return n === null ? null : { op: ">", value: n };
  }
  if (raw[0] === "<") {
    const n = parseScalar(field, raw.slice(1));
    return n === null ? null : { op: "<", value: n };
  }

  // Bare number = equality interpreted as "between [n, n]" so chips can
  // round-trip a single bucket label cleanly. (Not heavily used; chips
  // generate range or comparison forms.)
  const n = parseScalar(field, raw);
  if (n === null) return null;
  return { op: "between", value: [n, n] };
}

function parseScalar(field: NumericField, s: string): number | null {
  if (s.length === 0) return null;
  // Strip a single suffix.
  let value = s;
  let multiplier = 1;
  if (field === "latency") {
    if (value.endsWith("ms")) {
      value = value.slice(0, -2);
    } else if (value.endsWith("s")) {
      value = value.slice(0, -1);
      multiplier = 1000;
    }
  }
  // Must be plain number characters now.
  if (!isPlainNumber(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n * multiplier;
}

function isPlainNumber(s: string): boolean {
  if (s.length === 0) return false;
  let dotSeen = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 46 /* . */) {
      if (dotSeen) return false;
      dotSeen = true;
    } else if (c < 48 || c > 57) {
      return false;
    }
  }
  return true;
}

/** Round-trip a numeric token value back to canonical text. */
export function formatNumericValue(
  field: NumericField,
  op: ">" | "<" | "between",
  value: number | [number, number],
): string {
  if (op === "between" && Array.isArray(value)) {
    return `${formatScalar(field, value[0])}..${formatScalar(field, value[1])}`;
  }
  if (op === ">") return `>${formatScalar(field, value as number)}`;
  if (op === "<") return `<${formatScalar(field, value as number)}`;
  return String(value);
}

function formatScalar(field: NumericField, n: number): string {
  if (field === "latency") {
    if (n >= 1000 && n % 1000 === 0) return `${n / 1000}s`;
    return `${n}ms`;
  }
  return String(n);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/query/fields.ts
git commit -m "feat(query): add field metadata and numeric value parser"
```

---

## Task 3: Write parser tests (TDD — failing)

**Files:**
- Create: `scripts/test-query-parser.ts`

- [ ] **Step 1: Add a tiny test harness + tests**

```ts
// scripts/test-query-parser.ts
// Run: npx tsx scripts/test-query-parser.ts
//
// Standalone test runner — no jest/vitest in this project. Each `test(name, fn)`
// runs the fn; assertion failures throw. Process exits non-zero on any failure.

import { parseQuery, serializeQuery } from "../lib/query/parser";
import type { QueryAST, Token } from "../lib/query/types";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${(e as Error).message}`);
  }
}

function assertEq<T>(actual: T, expected: T, label = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}\n  expected: ${e}\n  actual:   ${a}`);
}

const KNOWN = new Set(["hallucination", "citation", "qa"]);

console.log("--- parser tests ---");

test("empty string -> empty AST", () => {
  const { ast } = parseQuery("", KNOWN);
  assertEq(ast.tokens.length, 0);
  assertEq(ast.annotationCombinator, "AND");
});

test("annotation token: hallucination:pass", () => {
  const { ast } = parseQuery("hallucination:pass", KNOWN);
  assertEq(ast.tokens.length, 1);
  const t = ast.tokens[0];
  if (t.kind !== "annotation") throw new Error("expected annotation token");
  assertEq(t.name, "hallucination");
  assertEq(t.values, ["pass"]);
  assertEq(t.negate, false);
});

test("annotation token with comma OR values", () => {
  const { ast } = parseQuery("hallucination:pass,fail", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "annotation") throw new Error("expected annotation token");
  assertEq(t.values, ["pass", "fail"]);
});

test("annotation token with .ai suffix", () => {
  const { ast } = parseQuery("hallucination.ai:pass", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "annotation") throw new Error("expected annotation token");
  assertEq(t.name, "hallucination");
  assertEq(t.annotatorScope, "ai");
});

test("negated annotation", () => {
  const { ast } = parseQuery("-hallucination:fail", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "annotation") throw new Error("expected annotation token");
  assertEq(t.negate, true);
  assertEq(t.values, ["fail"]);
});

test("latency: >3s parses to ms", () => {
  const { ast } = parseQuery("latency:>3s", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "numeric") throw new Error("expected numeric token");
  assertEq(t.field, "latency");
  assertEq(t.op, ">");
  assertEq(t.value, 3000);
});

test("latency: 1s..3s parses to [1000,3000]", () => {
  const { ast } = parseQuery("latency:1s..3s", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "numeric") throw new Error("expected numeric token");
  assertEq(t.op, "between");
  assertEq(t.value, [1000, 3000]);
});

test("cost: <0.1", () => {
  const { ast } = parseQuery("cost:<0.1", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "numeric") throw new Error("expected numeric token");
  assertEq(t.value, 0.1);
});

test("status:error enum", () => {
  const { ast } = parseQuery("status:error", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "enum") throw new Error("expected enum token");
  assertEq(t.values, ["error"]);
});

test("model:gpt-4o is text token", () => {
  const { ast } = parseQuery("model:gpt-4o", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "text") throw new Error("expected text token");
  assertEq(t.value, "gpt-4o");
});

test("free text: bare word", () => {
  const { ast } = parseQuery("hello", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "freetext") throw new Error("expected freetext token");
  assertEq(t.text, "hello");
});

test('free text: quoted string preserves colon', () => {
  const { ast } = parseQuery('"how do I:"', KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "freetext") throw new Error("expected freetext token");
  assertEq(t.text, "how do i:");
});

test("unknown field becomes error token", () => {
  const { ast, errors } = parseQuery("bogus:something", KNOWN);
  assertEq(errors.length, 1);
  const t = ast.tokens[0];
  if (t.kind !== "error") throw new Error("expected error token");
});

test("multiple tokens parse independently (AND default)", () => {
  const { ast } = parseQuery("hallucination:pass latency:>3s", KNOWN);
  assertEq(ast.tokens.length, 2);
  assertEq(ast.annotationCombinator, "AND");
});

test("leading 'or:' marker sets combinator to OR", () => {
  const { ast } = parseQuery("or: hallucination:pass citation:fail", KNOWN);
  assertEq(ast.annotationCombinator, "OR");
  assertEq(ast.tokens.length, 2);
});

test("round-trip: annotation token", () => {
  const text = "hallucination:pass,fail";
  const { ast } = parseQuery(text, KNOWN);
  assertEq(serializeQuery(ast), text);
});

test("round-trip: numeric latency >3s", () => {
  const text = "latency:>3s";
  const { ast } = parseQuery(text, KNOWN);
  assertEq(serializeQuery(ast), text);
});

test("round-trip: negation preserved", () => {
  const text = "-status:error";
  const { ast } = parseQuery(text, KNOWN);
  assertEq(serializeQuery(ast), text);
});

test("round-trip: OR marker preserved", () => {
  const text = "or: hallucination:pass citation:fail";
  const { ast } = parseQuery(text, KNOWN);
  assertEq(serializeQuery(ast), text);
});

test("max length truncated to one error token", () => {
  const long = "a".repeat(2000);
  const { ast, errors } = parseQuery(long, KNOWN);
  // implementation choice: when over length, return single error token
  // describing the problem instead of attempting to parse.
  assertEq(ast.tokens.length, 1);
  assertEq(ast.tokens[0].kind, "error");
  assertEq(errors.length, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run the tests — expect all to fail**

```bash
npx tsx scripts/test-query-parser.ts
```

Expected: errors like "Cannot find module '../lib/query/parser'" because the parser file does not exist yet.

- [ ] **Step 3: Commit the failing tests**

```bash
git add scripts/test-query-parser.ts
git commit -m "test(query): add failing parser tests (TDD)"
```

---

## Task 4: Implement `lib/query/parser.ts`

**Files:**
- Create: `lib/query/parser.ts`

- [ ] **Step 1: Write the parser**

```ts
// lib/query/parser.ts
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

const ANNOTATION_VALUES = new Set<AnnotationValue>(["pass", "fail", "none"]);
const ANNOTATOR_SUFFIXES = new Set<AnnotatorScope>(["ai", "human", "diff"]);

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

  // Strip leading "or:" / "and:" marker (case-insensitive, must be the very first
  // word and followed by space).
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

  // Quoted -> always free text. Negation still respected.
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

  // key:value patterns.
  const colonIdx = body.indexOf(":");
  if (colonIdx <= 0 || colonIdx === body.length - 1) {
    // No colon, or colon at start, or trailing colon with no value -> free text.
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
    const suffix = rawKey.slice(dotIdx + 1).toLowerCase() as AnnotatorScope;
    if (ANNOTATOR_SUFFIXES.has(suffix)) {
      key = rawKey.slice(0, dotIdx);
      annotatorScope = suffix;
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

  // Annotation (case-preserved from input — Phoenix annotation names can vary).
  // We check the lowercase form against known set lowercased.
  if (isKnownAnnotation(key, knownAnnotations)) {
    const values = value
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v.length > 0) as AnnotationValue[];
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
      values,
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

  // Merge identical-name annotation tokens by union of values, preserving
  // first-seen order; respect negate (negated and positive kept separate).
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
    const key = `${tok.negate ? "-" : ""}${tok.name}${tok.annotatorScope ? "." + tok.annotatorScope : ""}`;
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
```

- [ ] **Step 2: Run parser tests — expect all to pass**

```bash
npx tsx scripts/test-query-parser.ts
```

Expected: `N passed, 0 failed`. If anything fails, fix the parser (not the tests) until green.

- [ ] **Step 3: Commit**

```bash
git add lib/query/parser.ts
git commit -m "feat(query): implement parser and serializer with round-trip"
```

---

## Task 5: Write filter engine tests (TDD — failing)

**Files:**
- Create: `scripts/test-query-filter.ts`

- [ ] **Step 1: Add filter test harness**

```ts
// scripts/test-query-filter.ts
// Run: npx tsx scripts/test-query-filter.ts

import { applyFilters } from "../lib/query/filter";
import { parseQuery } from "../lib/query/parser";
import type { Trace, Annotation } from "../lib/phoenix";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${(e as Error).message}`);
  }
}

function assertEq<T>(actual: T, expected: T, label = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}\n  expected: ${e}\n  actual:   ${a}`);
}

const KNOWN = new Set(["hallucination", "citation"]);

function ann(name: string, label: string, score: number, annotatorKind?: "LLM" | "HUMAN"): Annotation {
  return { name, label, score, annotatorKind };
}

function trace(over: Partial<Trace>): Trace {
  return {
    spanId: "s",
    traceId: "t",
    time: "2026-05-23T00:00:00Z",
    latency: 0,
    query: "",
    context: "",
    response: "",
    annotations: [],
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    model: "",
    status: "OK",
    spanKind: "LLM",
    ...over,
  };
}

const traces: Trace[] = [
  trace({ traceId: "t1", query: "hello world", latency: 500, annotations: [ann("hallucination", "pass", 1)], status: "OK" }),
  trace({ traceId: "t2", query: "foo bar",     latency: 2000, annotations: [ann("hallucination", "fail", 0.2)], status: "OK" }),
  trace({ traceId: "t3", query: "baz",         latency: 5000, annotations: [ann("citation", "fail", 0.1)], status: "ERROR" }),
  trace({ traceId: "t4", query: "no anns",     latency: 100,  annotations: [], status: "OK" }),
  trace({ traceId: "t5", query: "with model",  latency: 200,  annotations: [], status: "OK", model: "gpt-4o" }),
];

function ids(ts: Trace[]): string[] {
  return ts.map((t) => t.traceId).sort();
}

function run(q: string) {
  const { ast } = parseQuery(q, KNOWN);
  return applyFilters(traces, ast);
}

console.log("--- filter tests ---");

test("empty query returns all", () => {
  assertEq(ids(run("")), ["t1", "t2", "t3", "t4", "t5"]);
});

test("hallucination:pass matches t1", () => {
  assertEq(ids(run("hallucination:pass")), ["t1"]);
});

test("hallucination:fail matches t2", () => {
  assertEq(ids(run("hallucination:fail")), ["t2"]);
});

test("hallucination:none matches traces with no hallucination annotation", () => {
  assertEq(ids(run("hallucination:none")), ["t3", "t4", "t5"]);
});

test("comma OR: hallucination:pass,fail matches t1+t2", () => {
  assertEq(ids(run("hallucination:pass,fail")), ["t1", "t2"]);
});

test("negation -status:error excludes t3", () => {
  assertEq(ids(run("-status:error")), ["t1", "t2", "t4", "t5"]);
});

test("latency:>3s matches t3", () => {
  assertEq(ids(run("latency:>3s")), ["t3"]);
});

test("latency:1s..3s matches t2", () => {
  assertEq(ids(run("latency:1s..3s")), ["t2"]);
});

test("latency:<1s matches t1+t4+t5", () => {
  assertEq(ids(run("latency:<1s")), ["t1", "t4", "t5"]);
});

test("model:gpt-4o matches t5", () => {
  assertEq(ids(run("model:gpt-4o")), ["t5"]);
});

test("free text 'foo' matches t2 only", () => {
  assertEq(ids(run("foo")), ["t2"]);
});

test("default AND: hallucination:pass latency:<1s -> t1", () => {
  assertEq(ids(run("hallucination:pass latency:<1s")), ["t1"]);
});

test("annotation AND default: hallucination:pass citation:fail -> empty", () => {
  assertEq(ids(run("hallucination:pass citation:fail")), []);
});

test("annotation OR toggle: or: hallucination:pass citation:fail -> t1+t3", () => {
  assertEq(ids(run("or: hallucination:pass citation:fail")), ["t1", "t3"]);
});

test("OR toggle still ANDs non-annotation: or: hallucination:pass citation:fail latency:<1s -> t1", () => {
  assertEq(ids(run("or: hallucination:pass citation:fail latency:<1s")), ["t1"]);
});

test("status:error matches t3", () => {
  assertEq(ids(run("status:error")), ["t3"]);
});

test("error tokens are ignored (do not exclude rows)", () => {
  // 'bogus:xyz' is an error; should be ignored by filter, so all rows match.
  assertEq(ids(run("bogus:xyz")), ["t1", "t2", "t3", "t4", "t5"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run — expect failure**

```bash
npx tsx scripts/test-query-filter.ts
```

Expected: module not found error.

- [ ] **Step 3: Commit failing tests**

```bash
git add scripts/test-query-filter.ts
git commit -m "test(query): add failing filter engine tests (TDD)"
```

---

## Task 6: Implement `lib/query/filter.ts`

**Files:**
- Create: `lib/query/filter.ts`

- [ ] **Step 1: Implement the filter engine**

```ts
// lib/query/filter.ts
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

/** Apply an AST to a list of traces. Error tokens are ignored. */
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
    // Non-annotation tokens: always AND.
    for (const tok of otherTokens) {
      if (!matchToken(tr, tok)) return false;
    }

    // Annotation tokens: combine per AST.combinator.
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
  // TODO(spec #2 + #3): respect tok.annotatorScope (.ai / .human / .diff).
  //   For now we match against any annotation with this name, regardless of
  //   annotatorKind, so the parser can accept the suffix without affecting
  //   results. Once the annotation infrastructure spec lands, filter by
  //   annotation.annotatorKind === "LLM" (for .ai) / "HUMAN" (for .human).
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
    if (wantsFail && matching.some(isFail)) hit = true;
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
  // Cost: not exposed on Trace today; default to 0 so cost filters cleanly
  // exclude when user filters >0. (Cost is per-span; trace-level rollup is a
  // future enhancement.)
  return 0;
}

function matchEnum(tr: Trace, tok: EnumToken): boolean {
  let value: string;
  if (tok.field === "status") {
    value = (tr.status || "").toLowerCase();
    // Phoenix uses "OK" / "ERROR" — match user's ok/error spelling.
  } else if (tok.field === "spanKind") {
    value = (tr.spanKind || "").toLowerCase();
  } else if (tok.field === "feedback") {
    // Feedback not yet exposed on Trace. Treat as no match unless user asks
    // for "none". (Hooked up by future spec.)
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
  else if (tok.field === "name") haystack = "";
  // (Trace doesn't carry a "name" field; spans do. Trace-level name match
  // currently matches nothing. Future: derive from rootSpan.name.)
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
```

- [ ] **Step 2: Run filter tests — expect all pass**

```bash
npx tsx scripts/test-query-filter.ts
```

Expected: `N passed, 0 failed`. Iterate on filter (not tests) until green.

- [ ] **Step 3: Commit**

```bash
git add lib/query/filter.ts
git commit -m "feat(query): implement filter engine with AND/OR + negation"
```

---

## Task 7: Add `lib/query/index.ts` barrel

**Files:**
- Create: `lib/query/index.ts`

- [ ] **Step 1: Write the barrel**

```ts
// lib/query/index.ts
export * from "./types";
export * from "./fields";
export { parseQuery, serializeQuery } from "./parser";
export { applyFilters } from "./filter";
```

- [ ] **Step 2: Commit**

```bash
git add lib/query/index.ts
git commit -m "feat(query): add module barrel"
```

---

## Task 8: Add i18n strings

**Files:**
- Modify: `lib/i18n/en.ts:106-112` (the projects block — add new keys near existing filter strings)
- Modify: `lib/i18n/ko.ts` (parallel keys)

- [ ] **Step 1: Add keys to en.ts**

Add the following keys inside the `projects` object (after `clear: "Clear",`):

```ts
    // Query bar
    queryPlaceholder: "Filter: hallucination:pass latency:>3s ...",
    queryInvalid: "Unknown filter",
    combineAnd: "AND",
    combineOr: "OR",
    addAnnotation: "Add annotation",
    cost: "Cost",
    tokens: "Tokens",
    status: "Status",
    model: "Model",
```

- [ ] **Step 2: Add the same keys to ko.ts**

Open `lib/i18n/ko.ts`, find the `projects:` block, add (after the existing `clear` line):

```ts
    queryPlaceholder: "필터: hallucination:pass latency:>3s ...",
    queryInvalid: "알 수 없는 필터",
    combineAnd: "AND",
    combineOr: "OR",
    addAnnotation: "어노테이션 추가",
    cost: "비용",
    tokens: "토큰",
    status: "상태",
    model: "모델",
```

- [ ] **Step 3: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors related to i18n. (en and ko must have matching key sets — `Translations` type is structural.)

- [ ] **Step 4: Commit**

```bash
git add lib/i18n/en.ts lib/i18n/ko.ts
git commit -m "i18n(query): add query bar + chip row strings"
```

---

## Task 9: Implement `components/query-bar/query-bar.tsx`

**Files:**
- Create: `components/query-bar/query-bar.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/query-bar/query-bar.tsx
"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { parseQuery, serializeQuery } from "@/lib/query/parser";
import type { QueryAST } from "@/lib/query/types";

interface Props {
  /** Current AST (source of truth, owned by parent). */
  ast: QueryAST;
  /** Called with parsed AST and the raw text once the user pauses typing. */
  onChange: (ast: QueryAST, rawText: string) => void;
  /** Set of annotation names known to the project. */
  knownAnnotations: ReadonlySet<string>;
}

const DEBOUNCE_MS = 200;

export function QueryBar({ ast, onChange, knownAnnotations }: Props) {
  const t = useT();

  // Local text mirrors the AST when the AST changes from outside (chip clicks).
  // Local edits debounce-parse back into an AST.
  const serialized = useMemo(() => serializeQuery(ast), [ast]);
  const [text, setText] = useState(serialized);
  const lastExternalRef = useRef(serialized);

  // When parent ast changes (e.g. chip click), re-sync local text.
  useEffect(() => {
    if (serialized !== lastExternalRef.current) {
      setText(serialized);
      lastExternalRef.current = serialized;
    }
  }, [serialized]);

  // Debounce user typing -> parse -> emit.
  useEffect(() => {
    if (text === lastExternalRef.current) return;
    const handle = setTimeout(() => {
      const { ast: nextAst } = parseQuery(text, knownAnnotations);
      lastExternalRef.current = text;
      onChange(nextAst, text);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [text, knownAnnotations, onChange]);

  // Inline error indicator: count error tokens for the current text without
  // committing a debounced change.
  const { errors } = useMemo(
    () => parseQuery(text, knownAnnotations),
    [text, knownAnnotations],
  );
  const hasErrors = errors.length > 0;

  return (
    <div className="relative w-full">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.projects.queryPlaceholder}
        className={`h-9 w-full pl-8 pr-9 text-sm font-mono ${
          hasErrors ? "border-destructive" : ""
        }`}
        spellCheck={false}
        autoComplete="off"
      />
      {text && (
        <button
          type="button"
          aria-label={t.projects.clear}
          onClick={() => setText("")}
          className="absolute right-2 top-1/2 -translate-y-1/2"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      )}
      {hasErrors && (
        <p className="mt-1 text-xs text-destructive">
          {t.projects.queryInvalid}: {errors.map((e) => e.raw).join(", ")}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/query-bar/query-bar.tsx
git commit -m "feat(query-bar): add debounced query input with error display"
```

---

## Task 10: Implement `components/query-bar/chip-row.tsx`

**Files:**
- Create: `components/query-bar/chip-row.tsx`

- [ ] **Step 1: Write the chip row**

```tsx
// components/query-bar/chip-row.tsx
"use client";

import { useT } from "@/lib/i18n";
import type {
  AnnotationToken,
  AnnotationValue,
  NumericToken,
  QueryAST,
  Token,
} from "@/lib/query/types";

interface Props {
  ast: QueryAST;
  knownAnnotations: ReadonlySet<string>;
  onChange: (next: QueryAST) => void;
}

const LATENCY_BUCKETS: { label: string; tok: NumericToken | null }[] = [
  { label: "all", tok: null },
  {
    label: "<1s",
    tok: { kind: "numeric", field: "latency", op: "<", value: 1000, negate: false, raw: "latency:<1s" },
  },
  {
    label: "1-3s",
    tok: { kind: "numeric", field: "latency", op: "between", value: [1000, 3000], negate: false, raw: "latency:1s..3s" },
  },
  {
    label: ">3s",
    tok: { kind: "numeric", field: "latency", op: ">", value: 3000, negate: false, raw: "latency:>3s" },
  },
];

export function ChipRow({ ast, knownAnnotations, onChange }: Props) {
  const t = useT();

  function replaceField(
    pred: (tok: Token) => boolean,
    replacement: Token | null,
  ) {
    const next: Token[] = ast.tokens.filter((tok) => !pred(tok));
    if (replacement) next.push(replacement);
    onChange({ ...ast, tokens: next });
  }

  function setAnnotation(name: string, value: AnnotationValue | "all") {
    const pred = (tok: Token) =>
      tok.kind === "annotation" && tok.name.toLowerCase() === name.toLowerCase();
    if (value === "all") {
      replaceField(pred, null);
      return;
    }
    const replacement: AnnotationToken = {
      kind: "annotation",
      name,
      values: [value],
      negate: false,
      raw: `${name}:${value}`,
    };
    replaceField(pred, replacement);
  }

  function currentAnnotationValue(name: string): AnnotationValue | "all" {
    const tok = ast.tokens.find(
      (t): t is AnnotationToken =>
        t.kind === "annotation" && t.name.toLowerCase() === name.toLowerCase(),
    );
    if (!tok) return "all";
    // Show first selected value (chip UI is single-select; commas live in querybar).
    return tok.values[0] ?? "all";
  }

  function currentLatency(): string {
    const tok = ast.tokens.find(
      (t): t is NumericToken =>
        t.kind === "numeric" && t.field === "latency",
    );
    if (!tok) return "all";
    if (tok.op === "<" && tok.value === 1000) return "<1s";
    if (tok.op === ">" && tok.value === 3000) return ">3s";
    if (
      tok.op === "between" &&
      Array.isArray(tok.value) &&
      tok.value[0] === 1000 &&
      tok.value[1] === 3000
    ) {
      return "1-3s";
    }
    return "all"; // custom value entered in querybar -> chips show "all" so chip click doesn't clobber it accidentally
  }

  function setLatency(bucket: { label: string; tok: NumericToken | null }) {
    const pred = (tok: Token) =>
      tok.kind === "numeric" && tok.field === "latency";
    replaceField(pred, bucket.tok);
  }

  function toggleCombinator() {
    onChange({
      ...ast,
      annotationCombinator: ast.annotationCombinator === "AND" ? "OR" : "AND",
    });
  }

  const annotationNames = Array.from(knownAnnotations).sort();
  const showCombinatorToggle =
    ast.tokens.filter((t) => t.kind === "annotation").length >= 2;

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg border bg-muted/20 px-4 py-3">
      {annotationNames.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {t.projects.annotation}
            </p>
            {showCombinatorToggle && (
              <button
                type="button"
                onClick={toggleCombinator}
                className="rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider hover:bg-muted"
                title="Toggle annotation combinator"
              >
                {ast.annotationCombinator === "AND"
                  ? t.projects.combineAnd
                  : t.projects.combineOr}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {annotationNames.map((name) => {
              const current = currentAnnotationValue(name);
              return (
                <div key={name} className="flex items-center gap-2">
                  <span className="min-w-[8rem] text-xs font-medium">{name}</span>
                  {(["all", "pass", "fail", "none"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAnnotation(name, v)}
                      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                        current === v
                          ? "border-foreground bg-foreground text-background"
                          : "hover:bg-muted"
                      }`}
                    >
                      {v === "all"
                        ? t.projects.all
                        : v === "pass"
                          ? t.projects.pass
                          : v === "fail"
                            ? t.projects.fail
                            : t.projects.noAnnotation}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {t.projects.latency}
        </p>
        <div className="flex gap-1">
          {LATENCY_BUCKETS.map((b) => {
            const current = currentLatency();
            const active = current === b.label;
            return (
              <button
                key={b.label}
                type="button"
                onClick={() => setLatency(b)}
                className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "hover:bg-muted"
                }`}
              >
                {b.label === "all" ? t.projects.all : b.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the chip-row + query-bar barrel**

Create `components/query-bar/index.ts`:

```ts
export { QueryBar } from "./query-bar";
export { ChipRow } from "./chip-row";
```

- [ ] **Step 3: Run tsc**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any type mismatches.

- [ ] **Step 4: Commit**

```bash
git add components/query-bar/chip-row.tsx components/query-bar/index.ts
git commit -m "feat(query-bar): add chip row with annotation + latency chips"
```

---

## Task 11: Integrate into `project-view.tsx`

**Files:**
- Modify: `app/projects/[name]/project-view.tsx`

- [ ] **Step 1: Replace imports**

At the top of the file, change the existing imports:

Remove the lines:
```ts
import { Search, Filter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
```

Replace with:
```ts
import { Search } from "lucide-react";
import { QueryBar, ChipRow } from "@/components/query-bar";
import { parseQuery, serializeQuery, applyFilters } from "@/lib/query";
import type { QueryAST } from "@/lib/query";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
```

- [ ] **Step 2: Replace the three filter state hooks**

In `ProjectView`, remove these lines:

```ts
const [searchQuery, setSearchQuery] = useState("");
const [annotationFilter, setAnnotationFilter] = useState<"all" | "pass" | "fail" | "none">("all");
const [latencyFilter, setLatencyFilter] = useState<"all" | "fast" | "medium" | "slow">("all");
// ...
const [filterOpen, setFilterOpen] = useState(false);
```

Replace with (keep `filterOpen` for chip-row toggle):

```ts
const router = useRouter();
const pathname = usePathname();
const searchParams = useSearchParams();

// Derive known annotation names from loaded traces.
const knownAnnotations = useMemo(() => {
  const s = new Set<string>();
  for (const tr of traces) {
    for (const a of tr.annotations) s.add(a.name);
  }
  return s;
}, [traces]);

// Initialize AST from ?q= once knownAnnotations is available.
const [queryAST, setQueryAST] = useState<QueryAST>({ tokens: [], annotationCombinator: "AND" });
const initialQRef = useRef<string | null>(null);
useEffect(() => {
  const q = searchParams?.get("q") ?? "";
  if (initialQRef.current === q) return;
  initialQRef.current = q;
  const { ast } = parseQuery(q, knownAnnotations);
  setQueryAST(ast);
}, [searchParams, knownAnnotations]);

// Push AST changes back into URL (?q=...).
const syncUrl = useCallback(
  (ast: QueryAST) => {
    const text = serializeQuery(ast);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (text) params.set("q", text);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  },
  [router, pathname, searchParams],
);

const handleQueryChange = useCallback(
  (ast: QueryAST) => {
    setQueryAST(ast);
    syncUrl(ast);
  },
  [syncUrl],
);

const [filterOpen, setFilterOpen] = useState(false);
```

(You need to import `useRef` in the React import line — extend it to include `useRef` if not already.)

- [ ] **Step 3: Replace `filteredTraces` derivation**

Remove the existing block (the `GOOD_LABELS = ...` and the `traces.filter((tr) => { ... })` body — currently `project-view.tsx:131-151`).

Replace with:

```ts
// ── Filtering ──
const filteredTraces = useMemo(
  () => applyFilters(traces, queryAST),
  [traces, queryAST],
);

const filteredTraceIds = useMemo(
  () => new Set(filteredTraces.map((t) => t.traceId)),
  [filteredTraces],
);

const filteredTraceTrees = useMemo(
  () => traceTrees.filter((t) => filteredTraceIds.has(t.traceId)),
  [traceTrees, filteredTraceIds],
);

const hasActiveFilters = queryAST.tokens.length > 0;
```

- [ ] **Step 4: Replace the filter UI block**

Remove the existing `{/* Search */}` + `{/* Filter toggle */}` + `{/* Clear button */}` + `{filterOpen && (<div ...>...</div>)}` block — currently `project-view.tsx:394-484` inside the "Trace list" header section.

Replace the right-hand control cluster (inside `<div className="flex items-center gap-2">`) with:

```tsx
<button
  onClick={() => setFilterOpen(!filterOpen)}
  className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
    filterOpen || hasActiveFilters ? "border-primary bg-accent" : "hover:bg-muted"
  }`}
>
  {filterOpen ? t.projects.clear : t.common.filter}
  {hasActiveFilters && (
    <span className="rounded bg-primary px-1 text-[10px] font-bold text-primary-foreground">
      {queryAST.tokens.filter((t) => t.kind !== "error").length}
    </span>
  )}
</button>
{hasActiveFilters && (
  <button
    onClick={() =>
      handleQueryChange({ tokens: [], annotationCombinator: "AND" })
    }
    className="text-xs text-muted-foreground hover:text-foreground"
  >
    {t.projects.clear}
  </button>
)}
```

Above the chip row (just below the "Trace list" header div), add the query bar full-width:

```tsx
<div className="mt-3">
  <QueryBar
    ast={queryAST}
    onChange={handleQueryChange}
    knownAnnotations={knownAnnotations}
  />
</div>
{filterOpen && (
  <ChipRow
    ast={queryAST}
    knownAnnotations={knownAnnotations}
    onChange={handleQueryChange}
  />
)}
```

- [ ] **Step 5: Update the SpanTreeView call and EmptyState check**

Find the existing:

```tsx
{traceTrees.length === 0 ? (
  <EmptyState ... />
) : (
  <SpanTreeView traces={traceTrees} projectName={projectName} onRefresh={loadTraces} />
)}
```

Change `traceTrees` to `filteredTraceTrees` in both the conditional and the prop:

```tsx
{filteredTraceTrees.length === 0 ? (
  <EmptyState
    icon={Search}
    title={traces.length === 0 ? t.projects.noTracesFound : t.projects.noTracesMatch}
    description={traces.length === 0 ? t.projects.noTracesYet : t.projects.adjustFilters}
    className="py-12"
  />
) : (
  <SpanTreeView traces={filteredTraceTrees} projectName={projectName} onRefresh={loadTraces} />
)}
```

- [ ] **Step 6: Update the trace-list subtitle**

Find:

```tsx
{hasActiveFilters
  ? `${filteredTraces.length} / ${traces.length} ${t.projects.tracesCount}`
  : t.projects.recentRequests}
```

Change `filteredTraces.length` to `filteredTraceTrees.length` and `traces.length` to `traceTrees.length`:

```tsx
{hasActiveFilters
  ? `${filteredTraceTrees.length} / ${traceTrees.length} ${t.projects.tracesCount}`
  : t.projects.recentRequests}
```

- [ ] **Step 7: Make sure `useRef` is imported**

The first react import line is:

```ts
import { useEffect, useState, useCallback, useMemo } from "react";
```

Change to:

```ts
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
```

- [ ] **Step 8: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any straggler issues (typo in variable, missing import).

- [ ] **Step 9: Re-run parser + filter tests**

```bash
npx tsx scripts/test-query-parser.ts && npx tsx scripts/test-query-filter.ts
```

Expected: both report `0 failed`.

- [ ] **Step 10: Commit**

```bash
git add app/projects/[name]/project-view.tsx
git commit -m "feat(project-view): adopt query AST + URL sync + chip row"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run TypeScript**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 2: Run all standalone tests**

```bash
npx tsx scripts/test-query-parser.ts
npx tsx scripts/test-query-filter.ts
```

Expected: both green.

- [ ] **Step 3: Final commit if any tail fixes**

If any files were touched in step 1-2, commit with an appropriate message. Otherwise skip.

---

## Self-review notes

- **Spec coverage:** parser, filter, chip<->bar two-way sync, URL state, negation, AND/OR toggle, comma OR, free text, quoted text, `.ai/.human/.diff` suffix (with TODO for filter behavior), max length / max tokens, error tokens visible — all covered.
- **Out of scope by design:** autocomplete dropdown (deferred, documented), date-range serialization (orthogonal), cost field (data not on Trace; predicate is safely 0), feedback field (not on Trace; predicate matches "none").
- **Conflict-risk for parallel spec #2/#3 (annotation infrastructure):** the only overlap is `lib/query/filter.ts:matchAnnotationToken` — the TODO comment documents exactly the change they need.
- **No `prisma/schema.prisma` modifications.** No SSE files touched. No `trace-detail-view.tsx` touched.
