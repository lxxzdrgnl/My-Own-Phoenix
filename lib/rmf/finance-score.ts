// 금융 AI RMF 위험점수 산정 (순수 함수). 단일 진실원천 — 편집기·보고서·테스트 공용.

import { RISK_SECTIONS, gradeFromTotal } from "./finance-rmf";
import type { AssessmentState, ScoreResult } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 항목별 잔여위험(인식·측정 − 경감)을 합산해 총점(0–100)과 위험등급을 산정.
 * 고영향 AI는 점수와 무관하게 최소 "고"로 승급. 거버넌스/통제는 등급에 미반영(FSS 구조).
 */
export function computeFinanceRisk(state: AssessmentState): ScoreResult {
  const perItemResidual: Record<string, number> = {};
  const sectionSubtotals: Record<string, number> = {};
  let total = 0;

  for (const section of RISK_SECTIONS) {
    let subtotal = 0;
    for (const item of section.items) {
      const st = state.riskItems[item.key];
      const inherent = clamp(st?.inherent ?? 0, 0, item.maxInherent);
      const mitigation = clamp(st?.mitigation ?? 0, 0, inherent);
      const residual = inherent - mitigation;
      perItemResidual[item.key] = residual;
      subtotal += residual;
    }
    sectionSubtotals[section.key] = subtotal;
    total += subtotal;
  }

  total = Math.round(total);
  let grade = gradeFromTotal(total);
  if (state.highImpact && (grade === "저" || grade === "중")) grade = "고";

  return { perItemResidual, sectionSubtotals, total, grade };
}
