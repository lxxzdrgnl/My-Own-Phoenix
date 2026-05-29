import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeFinanceRisk } from "../finance-score";
import { gradeFromTotal } from "../finance-rmf";
import type { AssessmentState } from "../types";

function state(riskItems: Record<string, { inherent: number; mitigation: number }>, highImpact = false): AssessmentState {
  const items: AssessmentState["riskItems"] = {};
  for (const [k, v] of Object.entries(riskItems)) items[k] = { ...v, source: "manual" };
  return { highImpact, riskItems: items, governance: {}, controls: {} };
}

describe("gradeFromTotal — 밴드 경계", () => {
  it("0/24=저, 25/49=중, 50/74=고, 75=초고", () => {
    assert.equal(gradeFromTotal(0), "저");
    assert.equal(gradeFromTotal(24), "저");
    assert.equal(gradeFromTotal(25), "중");
    assert.equal(gradeFromTotal(49), "중");
    assert.equal(gradeFromTotal(50), "고");
    assert.equal(gradeFromTotal(74), "고");
    assert.equal(gradeFromTotal(75), "초고");
    assert.equal(gradeFromTotal(100), "초고");
  });
});

describe("computeFinanceRisk", () => {
  it("빈 평가 → 총점 0, 저위험", () => {
    const r = computeFinanceRisk(state({}));
    assert.equal(r.total, 0);
    assert.equal(r.grade, "저");
  });

  it("잔여위험 합산 + 소계", () => {
    const r = computeFinanceRisk(state({
      security: { inherent: 8, mitigation: 2 },
      stability: { inherent: 8, mitigation: 0 },
    }));
    assert.equal(r.perItemResidual.security, 6);
    assert.equal(r.perItemResidual.stability, 8);
    assert.equal(r.sectionSubtotals.security, 14);
    assert.equal(r.total, 14);
    assert.equal(r.grade, "저");
  });

  it("고영향 AI → 저/중이어도 최소 고위험", () => {
    const r = computeFinanceRisk(state({ stability: { inherent: 8, mitigation: 0 } }, true));
    assert.equal(r.grade, "고");
  });

  it("inherent/mitigation clamp", () => {
    const r = computeFinanceRisk(state({ quality: { inherent: 999, mitigation: 999 } }));
    assert.equal(r.perItemResidual.quality, 0);
    const r2 = computeFinanceRisk(state({ quality: { inherent: 999, mitigation: 0 } }));
    assert.equal(r2.perItemResidual.quality, 6);
  });
});
