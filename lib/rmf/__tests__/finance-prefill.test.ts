import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prefillRiskItems, extractFindings } from "../finance-prefill";
import type { MetricValue } from "@/lib/rmf-utils";
import type { Annotation } from "@/lib/phoenix";

const M = (id: string, value: number, noData = false): MetricValue => ({ id, value, noData, formatted: "", status: "green" });

describe("prefillRiskItems", () => {
  it("metric 높을수록 위험 낮게 역매핑", () => {
    const out = prefillRiskItems([M("bias_rate", 80)], false);
    assert.equal(out.bias.inherent, 1); // round(6*0.2)
    assert.equal(out.bias.source, "eval");
  });
  it("noData 항목은 manual 0", () => {
    const out = prefillRiskItems([M("bias_rate", 0, true)], false);
    assert.equal(out.bias.inherent, 0);
    assert.equal(out.bias.source, "manual");
  });
  it("외부 provider → 위탁/관리 위험 신호", () => {
    const yes = prefillRiskItems([], true);
    assert.equal(yes.outsourcing.source, "provider");
    assert.equal(yes.outsourcing.inherent, 4); // round(8/2)
    const no = prefillRiskItems([], false);
    assert.equal(no.outsourcing.source, "manual");
  });
});

describe("extractFindings — 사람 평가 우선", () => {
  const A = (name: string, label: string, kind: string, exp = ""): Annotation =>
    ({ name, label, score: 0, annotatorKind: kind, explanation: exp } as Annotation);

  it("HUMAN 판정이 LLM을 덮어씀 (사람=정상 → 지적 없음)", () => {
    const f = extractFindings({ s1: [A("bias", "biased", "LLM"), A("bias", "unbiased", "HUMAN")] });
    assert.equal(f.length, 0);
  });
  it("HUMAN 문제 판정 → 지적 사항", () => {
    const f = extractFindings({ s1: [A("citation", "faithful", "LLM"), A("citation", "unfaithful", "HUMAN", "근거 부족")] });
    assert.equal(f.length, 1);
    assert.equal(f[0].itemKey, "quality");
    assert.equal(f[0].annotatorKind, "HUMAN");
    assert.equal(f[0].reason, "근거 부족");
  });
  it("매핑 없는 eval은 무시 (rag_relevance)", () => {
    const f = extractFindings({ s1: [A("rag_relevance", "irrelevant", "LLM")] });
    assert.equal(f.length, 0);
  });
});
