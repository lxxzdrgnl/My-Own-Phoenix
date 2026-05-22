// scripts/test-query-parser.ts
// Run: npx tsx scripts/test-query-parser.ts
//
// Standalone test runner — no jest/vitest in this project. Each test runs the
// fn; assertion failures throw. Process exits non-zero if any fail.

import { parseQuery, serializeQuery } from "../lib/query/parser";

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

test("annotation token with .human suffix", () => {
  const { ast } = parseQuery("citation.human:fail", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "annotation") throw new Error("expected annotation token");
  assertEq(t.name, "citation");
  assertEq(t.annotatorScope, "human");
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

test("latency: >3000 (no suffix) is ms", () => {
  const { ast } = parseQuery("latency:>3000", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "numeric") throw new Error("expected numeric token");
  assertEq(t.value, 3000);
});

test("cost: <0.1", () => {
  const { ast } = parseQuery("cost:<0.1", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "numeric") throw new Error("expected numeric token");
  assertEq(t.value, 0.1);
});

test("tokens: >1000", () => {
  const { ast } = parseQuery("tokens:>1000", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "numeric") throw new Error("expected numeric token");
  assertEq(t.field, "tokens");
  assertEq(t.value, 1000);
});

test("status:error enum", () => {
  const { ast } = parseQuery("status:error", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "enum") throw new Error("expected enum token");
  assertEq(t.values, ["error"]);
});

test("status:bogus produces error token", () => {
  const { ast } = parseQuery("status:bogus", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "error") throw new Error("expected error token");
});

test("spanKind:guardrail enum (no whitelist)", () => {
  const { ast } = parseQuery("spanKind:guardrail", KNOWN);
  const t = ast.tokens[0];
  if (t.kind !== "enum") throw new Error("expected enum token");
  assertEq(t.values, ["guardrail"]);
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

test("free text: quoted string preserves space", () => {
  const { ast } = parseQuery('"how do I" latency:<1s', KNOWN);
  assertEq(ast.tokens.length, 2);
  const f = ast.tokens[0];
  if (f.kind !== "freetext") throw new Error("expected freetext token");
  assertEq(f.text, "how do i");
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

test("leading 'and:' marker sets combinator to AND", () => {
  const { ast } = parseQuery("and: hallucination:pass citation:fail", KNOWN);
  assertEq(ast.annotationCombinator, "AND");
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

test("round-trip: annotator suffix preserved", () => {
  const text = "hallucination.ai:pass";
  const { ast } = parseQuery(text, KNOWN);
  assertEq(serializeQuery(ast), text);
});

test("max length truncated to one error token", () => {
  const long = "a".repeat(2000);
  const { ast, errors } = parseQuery(long, KNOWN);
  assertEq(ast.tokens.length, 1);
  assertEq(ast.tokens[0].kind, "error");
  assertEq(errors.length, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
