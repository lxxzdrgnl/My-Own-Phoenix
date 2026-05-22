/**
 * Pure-function tests for the guardrail helpers in `lib/phoenix.ts`.
 *
 * Run with:  npx tsx --test lib/__tests__/phoenix.guardrail.test.ts
 *
 * Uses node:test + node:assert so we don't have to add a test framework
 * to the project. These tests are intentionally limited to pure logic
 * (no React, no fetch) — they verify:
 *   1. parseGuardrailDetections handles the canonical JSON-string form,
 *      already-parsed arrays, malformed input, and empty input.
 *   2. computeHasGuardrailTriggered walks a span tree correctly.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseGuardrailDetections,
  computeHasGuardrailTriggered,
  type RawSpan,
} from "../phoenix";

function makeSpan(overrides: Partial<RawSpan>): RawSpan {
  return {
    spanId: "s",
    traceId: "t",
    parentId: null,
    name: "",
    spanKind: "",
    status: "OK",
    latency: 0,
    input: "",
    output: "",
    model: "",
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0,
    annotations: [],
    children: [],
    ...overrides,
  };
}

describe("parseGuardrailDetections", () => {
  it("returns [] for null/undefined/empty", () => {
    assert.deepEqual(parseGuardrailDetections(undefined), []);
    assert.deepEqual(parseGuardrailDetections(null), []);
    assert.deepEqual(parseGuardrailDetections(""), []);
  });

  it("parses a JSON-string array (canonical OTel form)", () => {
    const raw = JSON.stringify([
      { type: "phone", start: 5, end: 17, masked: "[PHONE]" },
      { type: "email", start: 30, end: 45, masked: "[EMAIL]" },
    ]);
    const out = parseGuardrailDetections(raw);
    assert.equal(out.length, 2);
    assert.equal(out[0].type, "phone");
    assert.equal(out[0].start, 5);
    assert.equal(out[0].end, 17);
    assert.equal(out[0].masked, "[PHONE]");
    assert.equal(out[1].type, "email");
  });

  it("accepts an already-parsed array", () => {
    const arr = [{ type: "rrn", start: 0, end: 13, masked: "[RRN]" }];
    const out = parseGuardrailDetections(arr);
    assert.equal(out.length, 1);
    assert.equal(out[0].type, "rrn");
  });

  it("returns [] for malformed JSON", () => {
    assert.deepEqual(parseGuardrailDetections("{not json"), []);
  });

  it("returns [] for non-array JSON", () => {
    assert.deepEqual(parseGuardrailDetections('{"type":"phone"}'), []);
  });

  it("skips entries missing required fields", () => {
    const out = parseGuardrailDetections([
      { type: "phone", start: 0, end: 5, masked: "[PHONE]" },
      { type: "email" }, // missing start/end -> skip
      { start: 1, end: 2, masked: "x" }, // missing type -> skip
      null,
      "string",
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].type, "phone");
  });
});

describe("computeHasGuardrailTriggered", () => {
  it("returns false for a tree with no GUARDRAIL spans", () => {
    const root = makeSpan({
      spanKind: "AGENT",
      children: [
        makeSpan({ spanKind: "LLM" }),
        makeSpan({ spanKind: "TOOL" }),
      ],
    });
    assert.equal(computeHasGuardrailTriggered(root), false);
  });

  it("returns false when GUARDRAIL spans exist but none triggered", () => {
    const root = makeSpan({
      spanKind: "AGENT",
      children: [
        makeSpan({ spanKind: "GUARDRAIL", guardrailTriggered: false }),
        makeSpan({ spanKind: "GUARDRAIL", guardrailTriggered: false }),
      ],
    });
    assert.equal(computeHasGuardrailTriggered(root), false);
  });

  it("returns true when any GUARDRAIL child has triggered=true", () => {
    const root = makeSpan({
      spanKind: "AGENT",
      children: [
        makeSpan({ spanKind: "LLM" }),
        makeSpan({ spanKind: "GUARDRAIL", guardrailTriggered: true }),
      ],
    });
    assert.equal(computeHasGuardrailTriggered(root), true);
  });

  it("descends into nested children", () => {
    const root = makeSpan({
      spanKind: "AGENT",
      children: [
        makeSpan({
          spanKind: "CHAIN",
          children: [
            makeSpan({
              spanKind: "CHAIN",
              children: [
                makeSpan({ spanKind: "GUARDRAIL", guardrailTriggered: true }),
              ],
            }),
          ],
        }),
      ],
    });
    assert.equal(computeHasGuardrailTriggered(root), true);
  });

  it("handles spanKind case-insensitively", () => {
    const root = makeSpan({
      spanKind: "guardrail",
      guardrailTriggered: true,
    });
    assert.equal(computeHasGuardrailTriggered(root), true);
  });

  it("handles undefined guardrailTriggered as false", () => {
    const root = makeSpan({ spanKind: "GUARDRAIL" });
    assert.equal(computeHasGuardrailTriggered(root), false);
  });
});
