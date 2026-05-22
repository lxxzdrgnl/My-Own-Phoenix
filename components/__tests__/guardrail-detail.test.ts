/**
 * Pure-function tests for the diff/highlight helpers used by
 * `GuardrailDetail`. The helpers live in their own module
 * (`guardrail-diff.ts`) so Node-only test runners don't have to load
 * React or "use client" code.
 *
 * Run with:
 *   npx tsx --test components/__tests__/guardrail-detail.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildHighlightSegments,
  locateMaskedRanges,
} from "../span-detail/guardrail-diff";

describe("buildHighlightSegments", () => {
  it("returns empty array for empty source", () => {
    assert.deepEqual(buildHighlightSegments("", [{ start: 0, end: 5 }]), []);
  });

  it("returns the source as one unhighlighted segment when no ranges", () => {
    const out = buildHighlightSegments("hello world", []);
    assert.deepEqual(out, [{ text: "hello world", highlighted: false }]);
  });

  it("highlights a single range", () => {
    // "영업3팀 장그래 사원" — positions 5..9 = "장그래 "
    const src = "영업3팀 장그래 사원";
    const out = buildHighlightSegments(src, [{ start: 5, end: 8 }]);
    assert.equal(out.length, 3);
    assert.equal(out[0].text, "영업3팀 ");
    assert.equal(out[0].highlighted, false);
    assert.equal(out[1].text, "장그래");
    assert.equal(out[1].highlighted, true);
    assert.equal(out[2].text, " 사원");
    assert.equal(out[2].highlighted, false);
  });

  it("highlights multiple non-overlapping ranges", () => {
    const src = "ABCDEFGHIJ";
    const out = buildHighlightSegments(src, [
      { start: 1, end: 3 },
      { start: 6, end: 8 },
    ]);
    assert.deepEqual(out.map((s) => s.text).join(""), src);
    assert.equal(out.filter((s) => s.highlighted).length, 2);
  });

  it("merges overlapping ranges", () => {
    const src = "ABCDEFGHIJ";
    const out = buildHighlightSegments(src, [
      { start: 1, end: 5 },
      { start: 3, end: 7 },
    ]);
    // Should merge to 1..7 -> highlighted "BCDEFG"
    const highlighted = out.filter((s) => s.highlighted);
    assert.equal(highlighted.length, 1);
    assert.equal(highlighted[0].text, "BCDEFG");
  });

  it("clamps out-of-range ranges instead of throwing", () => {
    const src = "ABC";
    const out = buildHighlightSegments(src, [{ start: -5, end: 999 }]);
    // Clamped to 0..3 -> whole string highlighted
    assert.equal(out.length, 1);
    assert.equal(out[0].text, "ABC");
    assert.equal(out[0].highlighted, true);
  });

  it("drops invalid ranges (end <= start)", () => {
    const src = "ABC";
    const out = buildHighlightSegments(src, [
      { start: 2, end: 2 },
      { start: 3, end: 1 },
    ]);
    assert.deepEqual(out, [{ text: "ABC", highlighted: false }]);
  });
});

describe("locateMaskedRanges", () => {
  it("returns [] for empty masked string", () => {
    assert.deepEqual(
      locateMaskedRanges("", [
        { type: "phone", start: 0, end: 0, masked: "[PHONE]" },
      ]),
      [],
    );
  });

  it("finds each masked placeholder by indexOf", () => {
    const masked = "Call [PHONE] or email [EMAIL] today";
    const out = locateMaskedRanges(masked, [
      { type: "phone", start: 0, end: 0, masked: "[PHONE]" },
      { type: "email", start: 0, end: 0, masked: "[EMAIL]" },
    ]);
    assert.equal(out.length, 2);
    assert.equal(masked.slice(out[0].start, out[0].end), "[PHONE]");
    assert.equal(masked.slice(out[1].start, out[1].end), "[EMAIL]");
  });

  it("advances cursor so duplicate placeholders are both found", () => {
    const masked = "first [PHONE] then [PHONE] done";
    const out = locateMaskedRanges(masked, [
      { type: "phone", start: 0, end: 0, masked: "[PHONE]" },
      { type: "phone", start: 0, end: 0, masked: "[PHONE]" },
    ]);
    assert.equal(out.length, 2);
    assert.notEqual(out[0].start, out[1].start);
  });

  it("skips detections whose masked string is missing from output", () => {
    const masked = "Hi [NAME] there";
    const out = locateMaskedRanges(masked, [
      { type: "name", start: 0, end: 0, masked: "[NAME]" },
      { type: "phone", start: 0, end: 0, masked: "[PHONE]" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(masked.slice(out[0].start, out[0].end), "[NAME]");
  });

  it("skips detections with empty masked", () => {
    const masked = "hello world";
    const out = locateMaskedRanges(masked, [
      { type: "phone", start: 0, end: 0, masked: "" },
    ]);
    assert.deepEqual(out, []);
  });
});
