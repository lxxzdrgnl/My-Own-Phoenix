// scripts/test-query-filter.ts
// Run: npx tsx scripts/test-query-filter.ts

import { applyFilters } from "../lib/query/filter";
import { parseQuery } from "../lib/query/parser";
import type { Annotation, Trace } from "../lib/phoenix";

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

function ann(
  name: string,
  label: string,
  score: number,
  annotatorKind?: "LLM" | "HUMAN",
): Annotation {
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
  trace({
    traceId: "t1",
    query: "hello world",
    latency: 500,
    annotations: [ann("hallucination", "pass", 1)],
    status: "OK",
  }),
  trace({
    traceId: "t2",
    query: "foo bar",
    latency: 2000,
    annotations: [ann("hallucination", "fail", 0.2)],
    status: "OK",
  }),
  trace({
    traceId: "t3",
    query: "baz",
    latency: 5000,
    annotations: [ann("citation", "fail", 0.1)],
    status: "ERROR",
  }),
  trace({
    traceId: "t4",
    query: "no anns",
    latency: 100,
    annotations: [],
    status: "OK",
  }),
  trace({
    traceId: "t5",
    query: "with model",
    latency: 200,
    annotations: [],
    status: "OK",
    model: "gpt-4o",
  }),
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

test("hallucination:none matches traces without that annotation", () => {
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
  assertEq(
    ids(run("or: hallucination:pass citation:fail latency:<1s")),
    ["t1"],
  );
});

test("status:error matches t3", () => {
  assertEq(ids(run("status:error")), ["t3"]);
});

test("error tokens are ignored (do not exclude rows)", () => {
  assertEq(ids(run("bogus:xyz")), ["t1", "t2", "t3", "t4", "t5"]);
});

test("annotator suffix .ai is accepted by parser, filter unchanged for now", () => {
  // TODO(spec #2 + #3): once annotator filtering lands, this should only
  // match annotations where annotatorKind === "LLM". For now, suffix is a
  // no-op and t1 still matches.
  assertEq(ids(run("hallucination.ai:pass")), ["t1"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
