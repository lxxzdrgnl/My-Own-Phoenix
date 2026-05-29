// eval 집계 → 위험평가 인식·측정 prefill + 사람 평가식 지적사항(findings). 순수 함수.
// 사람 평가(HUMAN) 우선: (span, eval)별 HUMAN > CODE > LLM 으로 collapse.

import type { Annotation } from "@/lib/phoenix";
import type { MetricValue } from "@/lib/rmf-utils";
import { RISK_SECTIONS, EVAL_TO_ITEMS, PROBLEM_LABELS } from "./finance-rmf";
import type { RiskItemState, Finding } from "./types";

/** eval metric(0–100, 높을수록 양호) → 항목 인식·측정 위험(0..만점). 위탁/관리는 provider 신호. */
export function prefillRiskItems(
  metrics: MetricValue[],
  hasExternalProvider: boolean,
): Record<string, RiskItemState> {
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const out: Record<string, RiskItemState> = {};

  for (const section of RISK_SECTIONS) {
    for (const item of section.items) {
      if (item.providerSignal) {
        out[item.key] = hasExternalProvider
          ? { inherent: Math.round(item.maxInherent / 2), mitigation: 0, source: "provider", note: "외부 LLM 공급자 사용 감지 — 위탁 관리체계 점검 필요" }
          : { inherent: 0, mitigation: 0, source: "manual" };
        continue;
      }
      const m = item.evalMetricId ? byId.get(item.evalMetricId) : undefined;
      if (m && !m.noData) {
        out[item.key] = {
          inherent: Math.round((item.maxInherent * (100 - m.value)) / 100),
          mitigation: 0,
          source: "eval",
        };
      } else {
        out[item.key] = { inherent: 0, mitigation: 0, source: "manual" };
      }
    }
  }
  return out;
}

const RANK: Record<string, number> = { HUMAN: 3, CODE: 2, LLM: 1 };

/** annMap(span별 annotation) → 지적사항. 사람 평가 우선 collapse 후 문제 항목만 수집. */
export function extractFindings(annMap: Record<string, Annotation[]>): Finding[] {
  const findings: Finding[] = [];

  for (const anns of Object.values(annMap)) {
    const best = new Map<string, Annotation>();
    for (const a of anns) {
      const rank = RANK[a.annotatorKind ?? "LLM"] ?? 1;
      const cur = best.get(a.name);
      const curRank = cur ? RANK[cur.annotatorKind ?? "LLM"] ?? 1 : -1;
      if (rank > curRank) best.set(a.name, a);
    }
    for (const a of best.values()) {
      const mapping = EVAL_TO_ITEMS[a.name];
      if (!mapping) continue;
      if (!PROBLEM_LABELS.has(a.label)) continue;
      const loc = mapping[0];
      findings.push({
        sectionKey: loc.section,
        itemKey: loc.item,
        eval: a.name,
        label: a.label,
        score: a.score ?? 0,
        reason: a.explanation || "",
        annotatorKind: (a.annotatorKind as Finding["annotatorKind"]) ?? "LLM",
      });
    }
  }
  return findings;
}
