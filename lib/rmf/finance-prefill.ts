// eval 집계 → 위험평가 인식·측정 prefill + 사람 평가식 지적사항(findings). 순수 함수.
// 사람 평가(HUMAN) 우선: (span, eval)별 HUMAN > CODE > LLM 으로 collapse.

import type { Annotation } from "@/lib/phoenix";
import type { MetricValue } from "@/lib/rmf-utils";
import { RISK_SECTIONS, EVAL_TO_ITEMS, PROBLEM_LABELS } from "./finance-rmf";
import type { RiskItemState, Finding } from "./types";

/** 항목별 수동 override(경감·인식 직접입력·메모) */
export interface RiskOverride {
  mitigation?: number;
  inherentOverride?: number;
  note?: string;
}

/**
 * eval 자동 prefill 위에 평가자 수동 override를 병합.
 * - inherentOverride 지정 시 인식·측정을 수동값으로 대체하고 source=manual
 * - mitigation/note는 지정 시 덮어씀
 * 점수 clamp(0..maxInherent, mitigation≤inherent)는 computeFinanceRisk가 담당.
 */
export function applyRiskOverrides(
  base: Record<string, RiskItemState>,
  overrides?: Record<string, RiskOverride>,
): Record<string, RiskItemState> {
  if (!overrides) return base;
  const out: Record<string, RiskItemState> = {};
  for (const [key, st] of Object.entries(base)) {
    const ov = overrides[key];
    if (!ov) { out[key] = st; continue; }
    const hasInherent = typeof ov.inherentOverride === "number";
    out[key] = {
      inherent: hasInherent ? (ov.inherentOverride as number) : st.inherent,
      mitigation: typeof ov.mitigation === "number" ? ov.mitigation : st.mitigation,
      source: hasInherent ? "manual" : st.source,
      note: ov.note ?? st.note,
    };
  }
  return out;
}

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

  for (const [spanId, anns] of Object.entries(annMap)) {
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
        spanId,
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
