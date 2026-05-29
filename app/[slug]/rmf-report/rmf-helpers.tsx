"use client";
// 금융 AI RMF 뷰 공용 헬퍼·상수·타입. (rmf-report-view / rmf-report-body 공용)

import { useT } from "@/lib/i18n";
import { MEASURE_METRICS } from "@/lib/rmf-utils";
import type { RawSpan } from "@/lib/phoenix";
import type { SpanData } from "@/lib/dashboard-utils";
import type { Grade, ChecklistStatus } from "@/lib/rmf/types";

export type T = ReturnType<typeof useT>;
export type RmfL10n = T["rmf"];

export const CHECK_STATUS_VALUES: ChecklistStatus[] = ["done", "partial", "insufficient"];
export const checkStatusLabel = (s: ChecklistStatus | undefined, st: Record<string, string>) => st[s ?? "unchecked"] ?? st.unchecked;

export const GRADES: Grade[] = ["저", "중", "고", "초고"];
export const GRADE_RANGE: Record<Grade, string> = { 저: "0–24", 중: "25–49", 고: "50–74", 초고: "75–100" };
export function gradeColor(g: Grade): string {
  if (g === "초고" || g === "고") return "#ef4444";
  if (g === "저") return "#10b981";
  return "#737373";
}
export const gradeText = (g: Grade, rmf: RmfL10n) => (rmf.grades as Record<string, string>)[g] + rmf.riskSuffix;
// 모노톤 팔레트: 높음(적)/낮음(녹)/보통(회)
export function ratioColor(r: number): string {
  if (r >= 0.5) return "#ef4444";
  if (r >= 0.25) return "#737373";
  return "#10b981";
}
export const ratioLabel = (r: number, lv: { high: string; mid: string; low: string }) => (r >= 0.5 ? lv.high : r >= 0.25 ? lv.mid : lv.low);
export const metricLabel = (id?: string) => MEASURE_METRICS.find((m) => m.id === id)?.label ?? "";

// finance-rmf 키 → 표시 라벨/설명 해석 (현재 로케일)
export const sectionLabel = (key: string, rmf: RmfL10n) => (rmf.sections as Record<string, string>)[key] ?? key;
export const itemText = (key: string, rmf: RmfL10n) => (rmf.items as Record<string, { label: string; guide: string }>)[key] ?? { label: key, guide: "" };
export const govText = (key: string, rmf: RmfL10n) => (rmf.governance as Record<string, { label: string; desc: string }>)[key] ?? { label: key, desc: "" };
export const ctrlText = (key: string, rmf: RmfL10n) => (rmf.controls as Record<string, { label: string; desc: string }>)[key] ?? { label: key, desc: "" };
export const matrixText = (g: Grade, rmf: RmfL10n) => (rmf.matrix as Record<string, { title: string; measures: readonly string[] }>)[g];

// AI 종합 피드백(JSON) — 에이전트 개선 관점
export interface RmfFeedback {
  summary: string;
  risks: { area: string; detail: string }[];
  improvements: { area: string; action: string; why?: string; how?: string }[];
}

/** LLM 응답에서 JSON 객체를 관대하게 추출·파싱 (코드펜스/잡설 제거). */
export function parseFeedback(raw: string): RmfFeedback | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  s = s.slice(start, end + 1);
  try {
    const o = JSON.parse(s);
    return {
      summary: typeof o.summary === "string" ? o.summary : "",
      risks: Array.isArray(o.risks) ? o.risks.filter((x: unknown) => x && typeof x === "object") : [],
      improvements: Array.isArray(o.improvements) ? o.improvements.filter((x: unknown) => x && typeof x === "object") : [],
    };
  } catch { return null; }
}

export function collectSpans(node: RawSpan): SpanData[] {
  const out: SpanData[] = [{
    latency: node.latency, status: node.status || "OK", time: "",
    promptTokens: node.promptTokens || 0, completionTokens: node.completionTokens || 0,
    totalTokens: node.totalTokens || 0, model: node.model || "", spanKind: node.spanKind || "",
  }];
  for (const c of node.children) out.push(...collectSpans(c));
  return out;
}

export const PRINT_CSS = `
@page { size: A4; margin: 11mm; }
/* 화면 미리보기: A4 시트 단위(회색 거터 위 흰 카드) */
.rmf-report { background: #f4f4f5; }
.rmf-sheet { width: 210mm; min-height: 297mm; box-sizing: border-box; margin: 0 auto 14px; background: #fff; padding: 11mm; box-shadow: 0 1px 8px rgba(0,0,0,0.12); }
.rmf-sheet:last-child { margin-bottom: 0; }
@media print {
  html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body * { visibility: hidden !important; }
  .rmf-report, .rmf-report * { visibility: visible !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .rmf-report { position: absolute !important; left: 0; top: 0; width: 100% !important; margin: 0 !important; background: none !important; padding: 0 !important; }
  /* 시트 1개 = 인쇄 1페이지 (화면 경계와 일치) */
  .rmf-sheet { width: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; break-after: page; }
  .rmf-sheet:last-child { break-after: auto; }
  .no-print { display: none !important; }
  table, .avoid-break { break-inside: avoid; }
  .rmf-report section { margin-bottom: 9px !important; }
  .rmf-head { margin-bottom: 8px !important; padding-bottom: 6px !important; }
  .rmf-head h1 { font-size: 20px !important; margin-top: 3px !important; }
  .rmf-hero { font-size: 26px !important; }
}
`;

export type SectionKey = "sectionDetail" | "findings" | "governance" | "controls" | "methodology";
export const SECTION_DEFS: { key: SectionKey; uiKey: "sectionDetailLabel" | "findingsSection" | "governanceSection" | "controlsSection" | "methodologySection" }[] = [
  { key: "sectionDetail", uiKey: "sectionDetailLabel" },
  { key: "findings", uiKey: "findingsSection" },
  { key: "governance", uiKey: "governanceSection" },
  { key: "controls", uiKey: "controlsSection" },
  { key: "methodology", uiKey: "methodologySection" },
];

export function SourceBadge({ source, subtle }: { source?: string; subtle?: boolean }) {
  const t = useT();
  const text = (t.rmf.sources as Record<string, string>)[source ?? "manual"] ?? t.rmf.sources.manual;
  if (subtle) {
    const cls = source === "eval"
      ? "bg-foreground/10 text-foreground/70 font-medium"
      : source === "provider"
        ? "bg-muted text-muted-foreground"
        : "border text-muted-foreground";
    return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] ${cls}`}>{text}</span>;
  }
  if (source === "eval") return <span className="rounded px-1 text-[9px]" style={{ background: "#10b981", color: "#fff" }}>{text}</span>;
  if (source === "provider") return <span className="rounded bg-neutral-700 px-1 text-[9px] text-white">{text}</span>;
  return <span className="rounded bg-neutral-200 px-1 text-[9px] text-neutral-600">{text}</span>;
}
