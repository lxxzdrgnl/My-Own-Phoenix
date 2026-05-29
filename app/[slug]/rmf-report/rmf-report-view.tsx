"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { FileDown, ArrowLeft, Save, Trash2, Sparkles, Clock, Cpu, Coins, Filter, X } from "lucide-react";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { logger } from "@/lib/logger";
import { fetchSpansAndAnnotations, buildTraceTrees, type RawSpan, type Annotation, type TraceTree } from "@/lib/phoenix";
import { extractInputPreview, extractText } from "@/lib/span-extraction";
import { computeMetrics, MEASURE_METRICS } from "@/lib/rmf-utils";
import type { SpanData, AnnotationData } from "@/lib/dashboard-utils";
import { DateRangePicker, getPresetRange, type DateRange } from "@/components/ui/date-range-picker";
import { Heading, Text } from "@/components/ui/typography";
import { Stack, Inline } from "@/components/ui/stack";
import { SectionCard } from "@/components/ui/section-card";
import { ModalShell, ModalHeader } from "@/components/ui/modal-shell";
import { LoadingState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { AnnotationBadge, AnnotationBadges } from "@/components/annotation-badge";
import { formatSec } from "@/components/trace-tree/span-tree-helpers";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ModelSelector } from "@/components/model-selector";
import { RISK_SECTIONS, GOVERNANCE_ITEMS, CONTROL_ITEMS, CONTROL_MATRIX } from "@/lib/rmf/finance-rmf";
import { prefillRiskItems, extractFindings, applyRiskOverrides, type RiskOverride } from "@/lib/rmf/finance-prefill";
import { useFormSubmit } from "@/lib/hooks/use-form-submit";
import { computeFinanceRisk } from "@/lib/rmf/finance-score";
import type { AssessmentState, Finding, Grade, ScoreResult, ChecklistItemState, ChecklistStatus } from "@/lib/rmf/types";

const CHECK_STATUS: { v: ChecklistStatus; label: string }[] = [
  { v: "done", label: "이행" },
  { v: "partial", label: "부분" },
  { v: "insufficient", label: "미흡" },
];
const checkStatusLabel = (s?: ChecklistStatus) => CHECK_STATUS.find((c) => c.v === s)?.label ?? "미점검";

const GRADES: Grade[] = ["저", "중", "고", "초고"];
const GRADE_RANGE: Record<Grade, string> = { 저: "0–24", 중: "25–49", 고: "50–74", 초고: "75–100" };
function gradeColor(g: Grade): string {
  if (g === "초고" || g === "고") return "#ef4444";
  if (g === "저") return "#10b981";
  return "#737373";
}
// 모노톤 팔레트: 높음(적)/낮음(녹)/보통(회)
function ratioColor(r: number): string {
  if (r >= 0.5) return "#ef4444";
  if (r >= 0.25) return "#737373";
  return "#10b981";
}
const ratioLabel = (r: number) => (r >= 0.5 ? "높음" : r >= 0.25 ? "보통" : "낮음");
const metricLabel = (id?: string) => MEASURE_METRICS.find((m) => m.id === id)?.label ?? "";

const ITEM_LABEL: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const s of RISK_SECTIONS) for (const i of s.items) m[i.key] = i.label;
  return m;
})();

// AI 종합 피드백(JSON) — 에이전트 개선 관점
interface RmfFeedback {
  summary: string;
  risks: { area: string; detail: string }[];
  improvements: { area: string; action: string; why?: string; how?: string }[];
}

/** LLM 응답에서 JSON 객체를 관대하게 추출·파싱 (코드펜스/잡설 제거). */
function parseFeedback(raw: string): RmfFeedback | null {
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

function collectSpans(node: RawSpan): SpanData[] {
  const out: SpanData[] = [{
    latency: node.latency, status: node.status || "OK", time: "",
    promptTokens: node.promptTokens || 0, completionTokens: node.completionTokens || 0,
    totalTokens: node.totalTokens || 0, model: node.model || "", spanKind: node.spanKind || "",
  }];
  for (const c of node.children) out.push(...collectSpans(c));
  return out;
}

const PRINT_CSS = `
@page { size: A4; margin: 11mm; }
@media print {
  html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body * { visibility: hidden !important; }
  .rmf-report, .rmf-report * { visibility: visible !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .rmf-report { position: absolute !important; left: 0; top: 0; width: 100% !important; margin: 0 !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
  .no-print { display: none !important; }
  .page-break { break-before: page; }
  table, .avoid-break { break-inside: avoid; }
  /* 1페이지에 머리말+종합등급+부문별+요약표가 모두 들어가도록 여백 압축 */
  .rmf-report section { margin-bottom: 9px !important; }
  .rmf-head { margin-bottom: 8px !important; padding-bottom: 6px !important; }
  .rmf-head h1 { font-size: 20px !important; margin-top: 3px !important; }
  .rmf-hero { font-size: 26px !important; }
}
`;

type SectionKey = "sectionDetail" | "findings" | "governance" | "controls" | "methodology";
const SECTION_LABELS: { key: SectionKey; label: string }[] = [
  { key: "sectionDetail", label: "부문별 상세 평가" },
  { key: "findings", label: "지적 사항" },
  { key: "governance", label: "거버넌스 현황" },
  { key: "controls", label: "위험통제 현황" },
  { key: "methodology", label: "평가 방법론" },
];

function SourceBadge({ source, subtle }: { source?: string; subtle?: boolean }) {
  if (subtle) {
    const text = source === "eval" ? "자동·eval" : source === "provider" ? "공급자 신호" : "수동";
    const cls = source === "eval"
      ? "bg-foreground/10 text-foreground/70 font-medium"
      : source === "provider"
        ? "bg-muted text-muted-foreground"
        : "border text-muted-foreground";
    return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] ${cls}`}>{text}</span>;
  }
  if (source === "eval") return <span className="rounded px-1 text-[9px]" style={{ background: "#10b981", color: "#fff" }}>자동·eval</span>;
  if (source === "provider") return <span className="rounded bg-neutral-700 px-1 text-[9px] text-white">공급자 신호</span>;
  return <span className="rounded bg-neutral-200 px-1 text-[9px] text-neutral-600">수동</span>;
}

interface BodyProps {
  score: ScoreResult;
  state: AssessmentState;
  metricById: Map<string, ReturnType<typeof computeMetrics>[number]>;
  findingsByItem: Record<string, Finding[]>;
  findingQuery: (f: Finding) => string;
  traceCount: number;
  sections: Record<SectionKey, boolean>;
  findingsCap: number;
}

// 보고서 본문(A4 문서) — 미리보기/인쇄 전용
function RmfBody({ score, state, metricById, findingsByItem, findingQuery, traceCount, sections, findingsCap }: BodyProps) {
  const sectionRatio = (key: string) => {
    const sec = RISK_SECTIONS.find((s) => s.key === key)!;
    return sec.weight > 0 ? (score.sectionSubtotals[key] ?? 0) / sec.weight : 0;
  };
  return (
    <>
      <section className="avoid-break mb-7">
        <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">종합 위험등급</h2>
        <div className="flex items-baseline gap-4">
          <div className="rmf-hero text-4xl font-extrabold" style={{ color: gradeColor(score.grade) }}>{score.grade}위험</div>
          <div className="text-[13px] text-neutral-600">잔여위험 총점 <b className="text-neutral-900">{score.total}</b> / 100</div>
        </div>
        <div className="mt-3 flex overflow-hidden rounded border text-center text-[10px]">
          {GRADES.map((g) => (
            <div key={g} className="flex-1 py-1.5" style={{ background: g === score.grade ? gradeColor(g) : "#f5f5f5", color: g === score.grade ? "#fff" : "#737373", fontWeight: g === score.grade ? 700 : 400 }}>
              {g}위험 ({GRADE_RANGE[g]})
            </div>
          ))}
        </div>
      </section>

      <section className="avoid-break mb-7">
        <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">부문별 위험도</h2>
        <div className="space-y-2">
          {RISK_SECTIONS.map((sec) => {
            const ratio = sectionRatio(sec.key);
            const pct = Math.min(100, Math.round(ratio * 100));
            const color = ratioColor(ratio);
            const fcount = sec.items.reduce((a, it) => a + (findingsByItem[it.key]?.length ?? 0), 0);
            return (
              <div key={sec.key} className="flex items-center gap-3 text-[11px]">
                <div className="w-24 shrink-0 font-medium">{sec.label} <span className="text-neutral-400">({sec.weight}%)</span></div>
                <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-100"><div className="h-full" style={{ width: pct + "%", background: color }} /></div>
                <div className="w-28 shrink-0 text-right"><span className="font-semibold" style={{ color }}>{ratioLabel(ratio)}</span><span className="text-neutral-500"> · {score.sectionSubtotals[sec.key] ?? 0}/{sec.weight}{fcount > 0 ? ` · 지적 ${fcount}` : ""}</span></div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="avoid-break mb-7">
        <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">Ⅰ. 위험평가 결과 요약 (7대 원칙)</h2>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-neutral-100 text-neutral-700">
              <th className="border px-2 py-1 text-left">부문(가중)</th><th className="border px-2 py-1 text-left">항목</th>
              <th className="border px-2 py-1">인식·측정</th><th className="border px-2 py-1">경감</th><th className="border px-2 py-1">잔여</th><th className="border px-2 py-1">소계</th>
            </tr>
          </thead>
          <tbody>
            {RISK_SECTIONS.map((sec) => sec.items.map((item, i) => {
              const st = state.riskItems[item.key];
              const measured = !!st && st.source !== "manual";
              return (
                <tr key={item.key}>
                  {i === 0 && <td className="border px-2 py-1 align-top font-medium" rowSpan={sec.items.length}>{sec.label} ({sec.weight}%)</td>}
                  <td className="border px-2 py-1">{item.label}</td>
                  <td className="border px-2 py-1 text-center">{measured ? st.inherent : "-"}</td>
                  <td className="border px-2 py-1 text-center">{st?.mitigation ? "(" + st.mitigation + ")" : "-"}</td>
                  <td className="border px-2 py-1 text-center font-medium">{measured ? (score.perItemResidual[item.key] ?? 0) : "-"}</td>
                  {i === 0 && <td className="border px-2 py-1 text-center align-top font-bold" rowSpan={sec.items.length}>{score.sectionSubtotals[sec.key] ?? 0}</td>}
                </tr>
              );
            }))}
            <tr className="bg-neutral-50 font-bold"><td className="border px-2 py-1" colSpan={4}>총점</td><td className="border px-2 py-1 text-center" colSpan={2}>{score.total} / 100 → {score.grade}위험</td></tr>
          </tbody>
        </table>
        <p className="mt-1 text-[10px] text-neutral-500">※ "-"는 자동 측정 불가 항목으로 총점에 미반영하며, 정성 평가(부문별 상세 참조)로 기술함. 총점·등급은 자동 측정 항목의 객관 지표 기준.</p>
      </section>

      {sections.sectionDetail && (
        <section className="page-break">
          <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">Ⅱ. 부문별 상세 평가</h2>
          {RISK_SECTIONS.map((sec) => (
            <div key={sec.key} className="mb-5">
              <h3 className="mb-2 text-[13px] font-bold text-neutral-800">{sec.label} <span className="font-normal text-neutral-500">(가중 {sec.weight}% · 소계 {score.sectionSubtotals[sec.key] ?? 0})</span></h3>
              <div className="space-y-2">
                {sec.items.map((item) => {
                  const st = state.riskItems[item.key];
                  const m = item.evalMetricId ? metricById.get(item.evalMetricId) : undefined;
                  const itemFindings = findingsByItem[item.key] ?? [];
                  return (
                    <div key={item.key} className="avoid-break rounded border border-neutral-200 p-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{item.label} <SourceBadge source={st?.source} /></span>
                        <span className="text-neutral-600">{st && st.source !== "manual" ? <>인식·측정 {st.inherent} · 경감 {st.mitigation} · <b>잔여 {score.perItemResidual[item.key] ?? 0}</b> / {item.maxInherent} · 지적 {itemFindings.length}건</> : <span className="text-neutral-400">정성 평가</span>}</span>
                      </div>
                      <p className="mt-1 text-neutral-500">근거: {item.providerSignal ? "외부 LLM 공급자 설정 신호" + (st?.note ? ` — ${st.note}` : "") : m && !m.noData ? metricLabel(item.evalMetricId) + " " + m.value.toFixed(1) + "%" : (st?.note ? `정성 평가 — ${st.note}` : "정성 평가 — 서술 미입력")}<span className="ml-1 text-neutral-400">· 채점기준: {item.scoringGuide}</span></p>
                      {sections.findings && itemFindings.length > 0 && (
                        <ul className="mt-1 space-y-1 border-t border-dashed pt-1">
                          {itemFindings.slice(0, findingsCap).map((f, idx) => {
                            const q = findingQuery(f);
                            return (
                              <li key={idx} className="text-neutral-700">
                                <span className="rounded bg-neutral-100 px-1 font-mono text-[9px]">{f.eval}</span>
                                {f.annotatorKind === "HUMAN" && <span className="ml-1 rounded px-1 text-[9px]" style={{ background: "#10b981", color: "#fff" }}>사람평가</span>}
                                <span className="ml-1">: {f.reason || f.label}</span>
                                {q && <span className="block text-neutral-400">└ 질의: {q.length > 80 ? q.slice(0, 80) + "…" : q}</span>}
                              </li>
                            );
                          })}
                          {itemFindings.length > findingsCap && <li className="text-neutral-400">…외 {itemFindings.length - findingsCap}건</li>}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {sections.governance && (
        <section className="page-break avoid-break mb-7">
          <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">Ⅲ. 거버넌스 체계 현황</h2>
          <ul className="space-y-1.5 text-[11px]">
            {GOVERNANCE_ITEMS.map((g) => {
              const cs = state.governance[g.key];
              const status = cs?.status ?? "done";
              const stColor = status === "done" ? "#10b981" : status === "insufficient" ? "#ef4444" : "#737373";
              return (
                <li key={g.key} className="border-b pb-1.5"><b>{g.label}</b> <span className="rounded px-1 text-[9px] text-white" style={{ background: stColor }}>{checkStatusLabel(status)}</span><p className="text-neutral-600">{cs?.note || g.description}</p></li>
              );
            })}
          </ul>
        </section>
      )}

      {sections.controls && (
        <section className="avoid-break mb-7">
          <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">Ⅳ. 위험통제 현황</h2>
          <div className="mb-3 rounded border bg-neutral-50 p-2 text-[11px]">
            <b>등급별 권고 통제 — {score.grade}위험 ({CONTROL_MATRIX[score.grade].title})</b>
            <ul className="ml-4 list-disc">{CONTROL_MATRIX[score.grade].measures.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </div>
          <ul className="space-y-1.5 text-[11px]">
            {CONTROL_ITEMS.map((c) => {
              const cs = state.controls[c.key];
              const status = cs?.status ?? "done";
              const stColor = status === "done" ? "#10b981" : status === "insufficient" ? "#ef4444" : "#737373";
              return (
                <li key={c.key} className="border-b pb-1.5">
                  <b>{c.label}</b>{" "}
                  <span className="rounded px-1 text-[9px] text-white" style={{ background: stColor }}>{checkStatusLabel(status)}</span>
                  {c.autoEvidenced && <span className="ml-1 rounded bg-neutral-200 px-1 text-[9px] text-neutral-600">자동 증빙</span>}
                  {c.key === "monitoring" && <span className="ml-1 text-neutral-500">(평가기간 {traceCount}개 트레이스 자동 모니터링)</span>}
                  <p className="text-neutral-600">{cs?.note || c.description}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {sections.methodology && (
        <section className="avoid-break">
          <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">Ⅴ. 평가 방법론 및 근거</h2>
          <ul className="ml-4 list-disc space-y-1 text-[11px] text-neutral-700">
            <li>위험평가(②)는 평가기간 내 {traceCount}개 트레이스의 자동 eval을 항목별 인식·측정 위험으로 환산.</li>
            <li>동일 항목에 사람 평가(HUMAN)가 있으면 LLM 평가보다 우선 반영.</li>
            <li>잔여위험 = 인식·측정 − 경감. 부문별 합산 → 총점(0–100) → 위험등급.</li>
            <li>위탁/관리는 외부 LLM 공급자 사용 여부로 자동 신호화. 거버넌스·위험통제는 평가자 정성 점검(이행/부분/미흡)으로 기재하며 등급 점수에는 미반영.</li>
            <li>정량 지표는 응답 수준 위험 신호이며, 최종 판단은 평가자·감독당국이 수행.</li>
          </ul>
        </section>
      )}
    </>
  );
}

export function RmfReportView() {
  const { phoenixProject, id: projectId } = useProject();
  const [loading, setLoading] = useState(true);
  const [annMap, setAnnMap] = useState<Record<string, Annotation[]>>({});
  const [trees, setTrees] = useState<TraceTree[]>([]);
  const [hasProvider, setHasProvider] = useState(false);

  const [mode, setMode] = useState<"config" | "preview">("config");
  const [tab, setTab] = useState<"dashboard" | "input" | "output">("dashboard");
  // 수동 평가(영속) — 고위험 여부·근거 + 위험항목 override(경감·미측정 인식·메모)
  const [highImpact, setHighImpact] = useState(false);
  const [hiReason, setHiReason] = useState("");
  const [overrides, setOverrides] = useState<Record<string, RiskOverride>>({});
  const [governance, setGovernance] = useState<Record<string, ChecklistItemState>>({});
  const [controls, setControls] = useState<Record<string, ChecklistItemState>>({});
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange(30));
  const [orgName, setOrgName] = useState("");
  const [assessor, setAssessor] = useState("");
  const [findingsCap, setFindingsCap] = useState(8);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const tracesRef = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({
    sectionDetail: true, findings: true, governance: true, controls: true, methodology: true,
  });
  const generatedAt = useMemo(() => new Date(), []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const { allSpans, annMap } = await fetchSpansAndAnnotations(
          phoenixProject, dateRange.from?.toISOString(), dateRange.to?.toISOString(), undefined, 1000,
        );
        if (!active) return;
        setAnnMap(annMap);
        setTrees(buildTraceTrees(allSpans, annMap));
      } catch (e) { logger.error("rmf-report load failed", e); }
      try {
        if (projectId) {
          const r = await apiFetch(`/api/projects/${projectId}/providers`);
          if (r.ok) { const d = await r.json(); const list = d.items ?? d.providers ?? []; if (active) setHasProvider(list.some((p: { isActive?: boolean }) => p.isActive)); }
        }
      } catch { /* ignore */ }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [phoenixProject, projectId, dateRange]);

  const metrics = useMemo(() => {
    if (!trees.length) return computeMetrics([], []);
    const spanData = trees.flatMap((t) => { const s = collectSpans(t.rootSpan); s[0].time = t.time; return s; });
    const annData: AnnotationData[] = trees.flatMap((t) => t.rootSpan.annotations.map((a) => ({ ...a, time: t.time })));
    return computeMetrics(spanData, annData);
  }, [trees]);
  const metricById = useMemo(() => new Map(metrics.map((m) => [m.id, m])), [metrics]);

  const state: AssessmentState = useMemo(() => ({
    highImpact,
    riskItems: applyRiskOverrides(prefillRiskItems(metrics, hasProvider), overrides),
    governance, controls,
  }), [metrics, hasProvider, overrides, highImpact, governance, controls]);

  // 저장된 수동 평가 로드
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    (async () => {
      try {
        const r = await apiFetch(`/api/projects/${projectId}/rmf-assessment`);
        if (!r.ok || !active) return;
        const d = await r.json();
        setHighImpact(!!d.highImpact);
        setOverrides((d.riskItems ?? {}) as Record<string, RiskOverride>);
        setGovernance((d.governance ?? {}) as Record<string, ChecklistItemState>);
        setControls((d.controls ?? {}) as Record<string, ChecklistItemState>);
        setHiReason(((d.notes ?? {}) as { highImpactReason?: string }).highImpactReason ?? "");
        const fb = d.feedback as { data?: RmfFeedback; model?: string; at?: string } | null;
        if (fb?.data) { setRecs(fb.data); setRecsAt(fb.at ?? ""); if (fb.model) setFbModel(fb.model); }
      } catch (e) { logger.error("rmf-assessment load failed", e); }
    })();
    return () => { active = false; };
  }, [projectId]);

  const [savedTick, setSavedTick] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const { submit: submitAssessment, saving: savingAssessment } = useFormSubmit(`/api/projects/${projectId}/rmf-assessment`, "PUT");
  const saveAssessment = useCallback(async () => {
    const ok = await submitAssessment({ highImpact, riskItems: overrides, governance, controls, notes: { highImpactReason: hiReason }, assessor });
    if (ok) { setSavedTick(true); setShowSaved(true); }
    return ok;
  }, [submitAssessment, highImpact, overrides, governance, controls, hiReason, assessor]);
  useEffect(() => { setSavedTick(false); }, [highImpact, hiReason, overrides, governance, controls]);

  const setChecklist = useCallback((kind: "gov" | "ctrl", key: string, patch: Partial<ChecklistItemState>) => {
    const setter = kind === "gov" ? setGovernance : setControls;
    setter((prev) => {
      const cur = prev[key] ?? { status: "done" as ChecklistStatus };
      const next: ChecklistItemState = { ...cur, ...patch };
      if (!next.note) delete next.note;
      return { ...prev, [key]: next };
    });
  }, []);

  const setOverride = useCallback((key: string, patch: Partial<RiskOverride>) => {
    setOverrides((prev) => {
      const next = { ...(prev[key] ?? {}), ...patch };
      // 빈 값 정리: undefined/NaN/"" 제거
      (Object.keys(next) as (keyof RiskOverride)[]).forEach((k) => {
        const v = next[k];
        if (v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v))) delete next[k];
      });
      return { ...prev, [key]: next };
    });
  }, []);

  const score = useMemo(() => computeFinanceRisk(state), [state]);
  const qualProgress = useMemo(() => {
    const items = RISK_SECTIONS.flatMap((s) => s.items).filter((it) => state.riskItems[it.key]?.source !== "eval");
    let filled = 0;
    for (const it of items) if ((overrides[it.key]?.note ?? "").trim()) filled++;
    for (const g of GOVERNANCE_ITEMS) if ((governance[g.key]?.note ?? "").trim()) filled++;
    for (const c of CONTROL_ITEMS) if ((controls[c.key]?.note ?? "").trim()) filled++;
    return { filled, total: items.length + GOVERNANCE_ITEMS.length + CONTROL_ITEMS.length };
  }, [state.riskItems, overrides, governance, controls]);
  const findings = useMemo(() => extractFindings(annMap), [annMap]);
  const findingsByItem = useMemo(() => {
    const m: Record<string, Finding[]> = {};
    for (const f of findings) (m[f.itemKey] ??= []).push(f);
    return m;
  }, [findings]);
  const findingsByEval = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of findings) m[f.eval] = (m[f.eval] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [findings]);
  const spanToTrace = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of trees) { const walk = (n: RawSpan) => { m.set(n.spanId, t.traceId); n.children.forEach(walk); }; walk(t.rootSpan); }
    return m;
  }, [trees]);
  const traceQuery = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of trees) m.set(t.traceId, extractInputPreview(t.rootSpan.input) || "");
    return m;
  }, [trees]);
  const findingQuery = (f: Finding) => traceQuery.get(spanToTrace.get(f.spanId) ?? "") ?? "";
  const fmtDate = (d?: Date) => (d ? d.toISOString().slice(0, 10) : "-");

  // 문제되는 트레이스 — 지적이 있는 트레이스 묶음 (지적 많은 순)
  const problematicTraces = useMemo(() => {
    const treeById = new Map(trees.map((t) => [t.traceId, t]));
    const byTrace = new Map<string, Finding[]>();
    for (const f of findings) {
      const tid = spanToTrace.get(f.spanId);
      if (!tid) continue;
      const arr = byTrace.get(tid) ?? [];
      arr.push(f);
      byTrace.set(tid, arr);
    }
    return [...byTrace.entries()]
      .map(([tid, fs]) => ({ tree: treeById.get(tid), findings: fs }))
      .filter((x): x is { tree: TraceTree; findings: Finding[] } => !!x.tree)
      .sort((a, b) => b.findings.length - a.findings.length);
  }, [findings, trees, spanToTrace]);

  // 선택된 위험항목으로 필터: 해당 항목 지적이 있는 트레이스만, 지적 사유도 그 항목으로 한정
  const shownTraces = useMemo(() => {
    if (!selectedItem) return problematicTraces;
    return problematicTraces
      .map(({ tree, findings: fs }) => ({ tree, findings: fs.filter((f) => f.itemKey === selectedItem) }))
      .filter((x) => x.findings.length > 0);
  }, [problematicTraces, selectedItem]);

  const selectItem = useCallback((key: string) => {
    setSelectedItem((cur) => {
      const next = cur === key ? null : key;
      if (next) requestAnimationFrame(() => tracesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return next;
    });
  }, []);

  // ── 보고서 저장 / 버전 ──
  const [versions, setVersions] = useState<Array<{ id: string; version: number; label: string | null; grade: string; total: number; createdAt: string; snapshot: any }>>([]);
  const [saving, setSaving] = useState(false);
  const [viewSnap, setViewSnap] = useState<{ version: number; snapshot: any } | null>(null);

  const loadVersions = useCallback(async () => {
    if (!projectId) return;
    try {
      const r = await apiFetch(`/api/projects/${projectId}/rmf-versions`);
      if (r.ok) { const d = await r.json(); setVersions(d.items ?? []); }
    } catch (e) { logger.error("rmf load versions failed", e); }
  }, [projectId]);
  useEffect(() => { loadVersions(); }, [loadVersions]);

  async function saveVersion() {
    if (!projectId) return;
    setSaving(true);
    try {
      const snapshot = { score, riskItems: state.riskItems, governance, controls, findingsByItem, traceCount: trees.length, sections, orgName, assessor, highImpact, hiReason, periodFrom: dateRange.from?.toISOString(), periodTo: dateRange.to?.toISOString() };
      const r = await apiFetch(`/api/projects/${projectId}/rmf-versions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade: score.grade, total: score.total, label: orgName || null, assessor, periodFrom: snapshot.periodFrom, periodTo: snapshot.periodTo, snapshot }),
      });
      if (r.ok) await loadVersions();
      else logger.error("rmf save version non-ok", undefined, { status: r.status });
    } catch (e) { logger.error("rmf save version failed", e); }
    setSaving(false);
  }

  async function deleteVersion(id: string) {
    if (!projectId) return;
    if (typeof window !== "undefined" && !window.confirm("이 저장 버전을 삭제할까요?")) return;
    try {
      await apiFetch(`/api/projects/${projectId}/rmf-versions/${id}`, { method: "DELETE" });
      await loadVersions();
    } catch (e) { logger.error("rmf delete version failed", e); }
  }

  // ── AI 종합 피드백 (LLM, JSON 구조) ──
  const [recs, setRecs] = useState<RmfFeedback | null>(null);
  const [recsAt, setRecsAt] = useState("");
  const [recsError, setRecsError] = useState("");
  const [recsLoading, setRecsLoading] = useState(false);
  const [fbModel, setFbModel] = useState("gpt-4o-mini");
  async function generateRecommendations() {
    if (!projectId) return;
    setRecsLoading(true);
    setRecsError("");
    try {
      const lines: string[] = [
        `대상 서비스(에이전트): ${phoenixProject}`,
        `종합 위험등급: ${score.grade}위험 (잔여위험 총점 ${score.total}/100)`,
        "부문별 잔여위험(소계/만점):",
        ...RISK_SECTIONS.map((sec) => `- ${sec.label}: ${score.sectionSubtotals[sec.key] ?? 0}/${sec.weight}`),
        `주요 지적사항(${findings.length}건 중 상위):`,
        ...findings.slice(0, 25).map((f) => `- [${ITEM_LABEL[f.itemKey] ?? f.itemKey}] ${f.eval}: ${f.reason || f.label}`),
      ];
      const sys = [
        "당신은 금융 AI 위험관리(금융감독원 AI RMF) 전문가입니다.",
        "아래 평가 결과를 바탕으로 '이 AI 에이전트를 어떻게 개선할지'에 초점을 둔 한국어 종합 피드백을 작성하세요.",
        "반드시 아래 JSON 객체 하나만 출력하세요. 코드펜스·설명·여는말 금지.",
        '{"summary":"현재 위험수준·핵심 문제 총평 2~3문장","risks":[{"area":"부문/항목명","detail":"왜 위험한지 1문장"}],"improvements":[{"area":"부문/항목명","action":"에이전트를 무엇을 바꿀지(프롬프트·가드레일·필터·데이터·휴먼리뷰 등 구체적 조치)","why":"어떤 위험을 줄이는지","how":"실제 적용 방법 1~2문장"}]}',
        "improvements는 위험이 높은 부문·항목 우선으로 3~6개, 에이전트 개선 관점에서 실행가능하게 작성하세요.",
      ].join("\n");
      const r = await apiFetch("/api/llm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: fbModel, projectId, promptLabel: "rmf-improvement", temperature: 0.3,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: lines.join("\n") },
          ],
        }),
      });
      if (!r.ok) { setRecsError("생성 실패 — 프로젝트 LLM 키 설정을 확인하세요."); return; }
      const d = await r.json();
      const parsed = parseFeedback(d.choices?.[0]?.message?.content ?? "");
      if (!parsed) { setRecsError("응답을 해석하지 못했습니다. 다시 생성해 주세요."); return; }
      const at = new Date().toISOString();
      setRecs(parsed);
      setRecsAt(at);
      // 자동 저장(영속) — 새로고침/재접속해도 유지
      apiFetch(`/api/projects/${projectId}/rmf-assessment`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: { data: parsed, model: fbModel, at } }),
      }).catch((e) => logger.error("rmf feedback save failed", e));
    } catch (e) { logger.error("rmf recommendations failed", e); setRecsError("생성 실패"); }
    finally { setRecsLoading(false); }
  }

  // 문서 렌더 소스: 저장본(viewSnap) 보기 중이면 그 스냅샷, 아니면 라이브
  const snap = viewSnap?.snapshot ?? null;
  const dScore: ScoreResult = snap ? snap.score : score;
  const dState: AssessmentState = snap ? { highImpact: !!snap.highImpact, riskItems: snap.riskItems, governance: snap.governance ?? {}, controls: snap.controls ?? {} } : state;
  const dMetricById = (snap ? new Map() : metricById) as typeof metricById;
  const dFindingsByItem: Record<string, Finding[]> = snap ? snap.findingsByItem : findingsByItem;
  const dFindingQuery = snap ? () => "" : findingQuery;
  const dTraceCount: number = snap ? snap.traceCount : trees.length;
  const dSections: Record<SectionKey, boolean> = snap ? snap.sections : sections;
  const dOrg: string = snap ? (snap.orgName ?? "") : orgName;
  const dAssessor: string = snap ? (snap.assessor ?? "") : assessor;
  const dFrom = snap ? (snap.periodFrom ? new Date(snap.periodFrom) : undefined) : dateRange.from;
  const dTo = snap ? (snap.periodTo ? new Date(snap.periodTo) : undefined) : dateRange.to;
  const dHighImpact: boolean = snap ? !!snap.highImpact : highImpact;
  const dHiReason: string = snap ? (snap.hiReason ?? "") : hiReason;

  const body = (
    <RmfBody score={dScore} state={dState} metricById={dMetricById} findingsByItem={dFindingsByItem}
      findingQuery={dFindingQuery} traceCount={dTraceCount} sections={dSections} findingsCap={findingsCap} />
  );

  // ─── 대시보드 단계 (앱 스타일 — human-review 참고) ───
  if (mode === "config") {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-5xl">
          <Inline gap="sm" className="mb-5 justify-between flex-wrap" align="start">
            <Stack gap="xs">
              <Heading level="page" as="h1" className="text-xl">금융 AI RMF 위험평가</Heading>
              <Text variant="caption" as="p">{phoenixProject} · 금융감독원 AI 위험관리 프레임워크 기준</Text>
            </Stack>
          </Inline>

          <div className="mb-5 flex gap-5 border-b">
            {([["dashboard", "대시보드"], ["input", "평가 입력"], ["output", "보고서 출력"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-1 py-2 text-sm font-medium transition-colors ${tab === k ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>
            ))}
          </div>

          {loading ? <LoadingState /> : tab === "dashboard" ? (
            <Stack gap="lg">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="h-28 rounded-xl border bg-card"><StatCard value={`${score.grade}위험`} label="종합 위험등급" /></div>
                <div className="h-28 rounded-xl border bg-card"><StatCard value={String(score.total)} label="잔여위험 총점" trend="/ 100" /></div>
                <div className="h-28 rounded-xl border bg-card"><StatCard value={String(trees.length)} label="분석 트레이스" /></div>
                <div className="h-28 rounded-xl border bg-card"><StatCard value={String(findings.length)} label="지적 사항" trend="건" /></div>
              </div>

              <div className="flex overflow-hidden rounded-lg border text-center text-xs">
                {GRADES.map((g) => (
                  <div key={g} className="flex-1 py-2" style={{ background: g === score.grade ? gradeColor(g) : "transparent", color: g === score.grade ? "#fff" : undefined, fontWeight: g === score.grade ? 600 : 400 }}>{g}위험 <span className="tabular-nums">({GRADE_RANGE[g]})</span></div>
                ))}
              </div>

              <SectionCard title="AI 종합 피드백" description="평가 결과 종합 분석·개선 권고 (LLM 생성 · 보고서에는 미포함됩니다)" variant="bordered" actions={
                <Inline gap="sm">
                  {recsAt && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{new Date(recsAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}</span>}
                  <div className="w-44"><ModelSelector value={fbModel} onChange={setFbModel} /></div>
                  <button onClick={generateRecommendations} disabled={recsLoading} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-40"><Sparkles className="h-3.5 w-3.5" /> {recsLoading ? "생성 중…" : recs ? "다시 생성" : "종합 피드백 생성"}</button>
                </Inline>
              }>
                {recs ? (
                  <Stack gap="md">
                    <div>
                      <Text variant="caption" className="font-medium text-foreground">종합 평가</Text>
                      <Text variant="caption" as="p" className="mt-1 leading-relaxed text-foreground/80">{recs.summary || "—"}</Text>
                    </div>
                    {recs.risks.length > 0 && (
                      <div>
                        <Text variant="caption" className="font-medium text-foreground">주요 위험 요인</Text>
                        <ul className="mt-1 space-y-1">
                          {recs.risks.map((rk, i) => (
                            <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground/80">
                              <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full" style={{ background: "#ef4444" }} />
                              <span><span className="font-medium text-foreground">{rk.area}</span> — {rk.detail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {recs.improvements.length > 0 && (
                      <div>
                        <Text variant="caption" className="font-medium text-foreground">에이전트 개선 권고</Text>
                        <ol className="mt-1.5 space-y-2">
                          {recs.improvements.map((im, i) => (
                            <li key={i} className="rounded-md border bg-muted/30 p-2.5">
                              <Text variant="caption" className="font-medium text-foreground">{i + 1}. {im.action}</Text>
                              {im.area && <span className="ml-1.5 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] text-foreground/70">{im.area}</span>}
                              {im.why && <Text variant="caption" as="p" className="mt-1 text-foreground/70">왜 — {im.why}</Text>}
                              {im.how && <Text variant="caption" as="p" className="text-foreground/70">어떻게 — {im.how}</Text>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </Stack>
                ) : recsError
                  ? <p className="text-sm" style={{ color: "#ef4444" }}>{recsError}</p>
                  : <Text variant="caption" as="p">「종합 피드백 생성」을 누르면 평가 결과·지적사항을 바탕으로 종합 평가·주요 위험, 그리고 <b className="text-foreground">에이전트 개선 권고</b>를 LLM이 생성합니다. (대시보드 전용 · 보고서에는 미포함됩니다)</Text>}
              </SectionCard>

              <Text variant="caption" as="p" className="rounded-lg border bg-muted/40 p-3 leading-relaxed">
                <b className="text-foreground">평가 방식</b> — 항목별 <b>고유위험(인식·측정)</b> − <b>경감(통제)</b> = <b className="text-foreground">잔여위험</b>. 잔여위험 합산(0–100)으로 등급 산정. <b className="text-foreground">잔여 X/Y</b> = 남은 위험 X(최대 Y) · <span style={{ color: "#10b981" }}>0=안전</span> ~ <span style={{ color: "#ef4444" }}>Y=위험</span>.
              </Text>

              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="부문별 위험도" variant="bordered">
                  <Stack gap="sm">
                    {RISK_SECTIONS.map((sec) => {
                      const sub = score.sectionSubtotals[sec.key] ?? 0;
                      const ratio = sec.weight > 0 ? sub / sec.weight : 0;
                      const pct = Math.min(100, Math.round(ratio * 100));
                      const color = ratioColor(ratio);
                      return (
                        <div key={sec.key} className="flex items-center gap-3 text-xs">
                          <div className="w-24 shrink-0 font-medium">{sec.label} <span className="text-muted-foreground">({sec.weight}%)</span></div>
                          <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: pct + "%", background: color }} /></div>
                          <div className="w-24 shrink-0 text-right"><span className="font-medium" style={{ color }}>{ratioLabel(ratio)}</span><span className="tabular-nums text-muted-foreground"> · {sub}/{sec.weight}</span></div>
                        </div>
                      );
                    })}
                  </Stack>
                </SectionCard>
                <SectionCard title="지적 사항 유형별 분포" description="eval별 지적 건수" variant="bordered">
                  {findingsByEval.length === 0 ? (
                    <Text variant="caption" as="p">지적 사항이 없습니다.</Text>
                  ) : (
                    <Stack gap="xs">
                      {findingsByEval.map(([name, count]) => {
                        const max = findingsByEval[0][1] || 1;
                        return (
                          <div key={name} className="flex items-center gap-2 text-xs">
                            <div className="w-36 shrink-0 font-mono text-xs">{name}</div>
                            <div className="relative h-4 flex-1 overflow-hidden rounded bg-muted"><div className="h-full rounded bg-foreground/80" style={{ width: Math.round((count / max) * 100) + "%" }} /></div>
                            <div className="w-8 shrink-0 text-right tabular-nums">{count}</div>
                          </div>
                        );
                      })}
                    </Stack>
                  )}
                </SectionCard>
              </div>

              <SectionCard title="위험평가 항목 (7대 원칙)" description="항목별 잔여위험 · 자동 측정 신호 기반" variant="bordered">
                <Stack gap="md">
                  {RISK_SECTIONS.map((sec) => {
                    const sub = score.sectionSubtotals[sec.key] ?? 0;
                    const sratio = sec.weight > 0 ? sub / sec.weight : 0;
                    const sfc = sec.items.reduce((a, it) => a + (findingsByItem[it.key]?.length ?? 0), 0);
                    return (
                      <div key={sec.key}>
                        <div className="mb-2 flex items-baseline justify-between gap-2 border-b pb-1.5">
                          <Text variant="body" as="p" className="font-medium">{sec.label}<span className="ml-1.5 text-xs text-muted-foreground">가중 {sec.weight}%</span></Text>
                          <Text variant="caption" as="span" className="tabular-nums"><span className="font-medium" style={{ color: ratioColor(sratio) }}>{ratioLabel(sratio)}</span> · 소계 {sub}/{sec.weight}{sfc > 0 ? ` · 지적 ${sfc}` : ""}</Text>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {sec.items.map((item) => {
                            const st = state.riskItems[item.key];
                            const measured = !!st && st.source !== "manual";
                            const residual = score.perItemResidual[item.key] ?? 0;
                            const inherent = st?.inherent ?? 0;
                            const mitigation = st?.mitigation ?? 0;
                            const rr = item.maxInherent > 0 ? residual / item.maxInherent : 0;
                            const pct = Math.min(100, Math.round(rr * 100));
                            const fc = findingsByItem[item.key]?.length ?? 0;
                            const color = ratioColor(rr);
                            const selectable = fc > 0;
                            const isSelected = selectedItem === item.key;
                            const m = item.evalMetricId ? metricById.get(item.evalMetricId) : undefined;
                            const basis = item.providerSignal
                              ? "외부 공급자 신호"
                              : m && !m.noData
                                ? `${metricLabel(item.evalMetricId)} ${m.value.toFixed(0)}%`
                                : "측정 신호 기반";
                            const evalText = item.providerSignal
                              ? "외부 LLM 공급자 설정 신호"
                              : item.evalMetricId
                                ? `${metricLabel(item.evalMetricId)} (${item.evalMetricId})${m && !m.noData ? ` · 측정값 ${m.value.toFixed(0)}%` : " · 데이터 없음"}`
                                : "eval 데이터 없음";
                            return (
                              <Tooltip key={item.key}>
                                <TooltipTrigger asChild>
                                  <div
                                    onClick={selectable ? () => selectItem(item.key) : undefined}
                                    className={`flex flex-col gap-2 rounded-lg border bg-card p-3 transition-all duration-200 ${selectable ? "cursor-pointer hover:border-foreground/40" : "cursor-help hover:border-foreground/30"} ${isSelected ? "border-foreground bg-foreground/[0.04] ring-1 ring-foreground" : ""} ${selectedItem && !isSelected ? "opacity-45 hover:opacity-100" : ""}`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="flex items-start gap-1.5 text-xs font-medium leading-tight"><span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: measured ? color : "#d4d4d8" }} />{item.label}</span>
                                      <SourceBadge source={st?.source} subtle />
                                    </div>
                                    {measured ? (
                                      <>
                                        <div className="flex items-baseline justify-between gap-1">
                                          <span className="flex items-baseline gap-1">
                                            <span className="text-base font-medium tabular-nums" style={{ color }}>{residual}</span>
                                            <Text variant="caption" as="span">/ {item.maxInherent} 잔여</Text>
                                          </span>
                                          <span className="text-xs font-medium" style={{ color }}>{ratioLabel(rr)}</span>
                                        </div>
                                        <div className="relative h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: pct + "%", background: color }} /></div>
                                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                          <span className="min-w-0 truncate">{basis}</span>
                                          {fc > 0 && <span className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-medium text-foreground/70">지적 {fc}</span>}
                                        </div>
                                      </>
                                    ) : (
                                      <Text variant="caption" as="span">미측정 · 수동 평가 필요</Text>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[280px]">
                                  <div className="space-y-1 leading-relaxed">
                                    <p className="font-medium">{item.label}</p>
                                    {measured ? (
                                      <>
                                        <p>인식·측정 {inherent} − 경감 {mitigation} = <b>잔여 {residual}</b> / {item.maxInherent} ({ratioLabel(rr)})</p>
                                        <p className="opacity-80">기반 eval: {evalText}</p>
                                        <p className="opacity-80">채점기준: {item.scoringGuide}</p>
                                        {fc > 0 && <p className="opacity-80">평가기간 내 자동 탐지 지적 {fc}건</p>}
                                      </>
                                    ) : (
                                      <p className="opacity-80">자동 측정 데이터 없음 — 수동 평가 필요{item.evalMetricId ? ` (기준 eval: ${item.evalMetricId})` : ""}</p>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </Stack>
              </SectionCard>

              <div ref={tracesRef} className="scroll-mt-4" />
              <SectionCard
                title="문제되는 트레이스"
                description={selectedItem ? `[${ITEM_LABEL[selectedItem] ?? selectedItem}] 관련 트레이스 ${shownTraces.length}건` : `지적이 탐지된 트레이스 ${problematicTraces.length}건 (요청·응답 및 지적 사유)`}
                variant="bordered"
              >
                {selectedItem && (
                  <div className="mb-3 flex items-center gap-2 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background delay-300 duration-500 fill-mode-backwards animate-in fade-in slide-in-from-top-2">
                    <Filter className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate">필터: <b>{ITEM_LABEL[selectedItem] ?? selectedItem}</b> · {shownTraces.length}건</span>
                    <button onClick={() => setSelectedItem(null)} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded border border-background/30 px-1.5 py-0.5 font-medium transition hover:bg-background/15"><X className="h-3 w-3" /> 해제</button>
                  </div>
                )}
                {shownTraces.length === 0 ? (
                  <Text variant="caption" as="p">{selectedItem ? "해당 항목으로 탐지된 트레이스가 없습니다." : "자동 탐지된 지적 사항이 없습니다."}</Text>
                ) : (
                  <Stack key={selectedItem ?? "all"} gap="sm" className="delay-300 duration-700 fill-mode-backwards animate-in fade-in">
                    {shownTraces.slice(0, 15).map(({ tree, findings: tf }) => {
                      const root = tree.rootSpan;
                      const inp = extractText(root.input) || "(입력 없음)";
                      const out = extractText(root.output) || "(출력 없음)";
                      const hasHuman = tf.some((f) => f.annotatorKind === "HUMAN");
                      const isError = (root.status || "OK") !== "OK";
                      return (
                        <div key={tree.traceId} className="rounded-lg border p-3">
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <Text variant="caption" as="p" className="font-medium uppercase tracking-wide text-foreground/70">트레이스</Text>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatSec(tree.latency)}</span>
                                {root.model && <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{root.model}</span>}
                                {root.totalTokens > 0 && <span className="flex items-center gap-1"><Coins className="h-3 w-3" /><span className="tabular-nums">{root.totalTokens.toLocaleString()}</span> tok</span>}
                                <span className="tabular-nums">{new Date(tree.time).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                                <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">{tree.spanCount} span</span>
                                {isError && <span className="font-medium" style={{ color: "#ef4444" }}>ERROR</span>}
                              </div>
                            </div>
                            <span className="shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">지적 {tf.length}{hasHuman ? " · 사람평가" : ""}</span>
                          </div>
                          {root.annotations.length > 0 && (
                            <div className="mb-2"><AnnotationBadges annotations={root.annotations} includeHuman /></div>
                          )}
                          <div className="grid gap-2 md:grid-cols-2">
                            <div className="rounded-md bg-muted/40 p-2">
                              <Text variant="caption" as="p" className="mb-1 font-medium text-foreground/70">입력</Text>
                              <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">{inp}</p>
                            </div>
                            <div className="rounded-md bg-muted/40 p-2">
                              <Text variant="caption" as="p" className="mb-1 font-medium text-foreground/70">출력</Text>
                              <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">{out}</p>
                            </div>
                          </div>
                          <div className="mt-2 border-t pt-2">
                            <Text variant="caption" as="p" className="mb-1.5 font-medium uppercase tracking-wide text-foreground/70">지적 사유 {tf.length}건</Text>
                            <Stack gap="sm">
                              {tf.map((f, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <span className="mt-0.5 shrink-0"><AnnotationBadge annotation={{ name: f.eval, label: f.label, score: f.score, annotatorKind: f.annotatorKind === "HUMAN" ? "HUMAN" : "LLM", explanation: f.reason }} /></span>
                                  <Text variant="caption" as="p" className="min-w-0 flex-1"><span className="text-foreground/70">[{ITEM_LABEL[f.itemKey] ?? f.itemKey}]</span> {f.reason || f.label}</Text>
                                </div>
                              ))}
                            </Stack>
                          </div>
                        </div>
                      );
                    })}
                  </Stack>
                )}
              </SectionCard>

            </Stack>
          ) : tab === "input" ? (
            <Stack gap="lg" className="pb-24 duration-300 animate-in fade-in">
              <Text variant="caption" as="p" className="rounded-lg border bg-muted/40 p-3 leading-relaxed">
                자동 측정(eval) 항목은 대시보드에서 객관 지표로 산정됩니다. 여기서는 <b className="text-foreground">사람 판단이 필요한 부분</b>(고위험 여부·미측정 항목·거버넌스·통제)을 서술로 평가하며, 정성 평가는 <b className="text-foreground">등급 점수에 반영되지 않고</b> 보고서에 기재됩니다.
              </Text>

              <SectionCard title="고위험 서비스 여부" description="개인 차별·권익·안전에 중대한 위험을 줄 수 있는 서비스면 '예'. 점수와 무관하게 최소 '고위험'으로 승급됩니다 (가이드라인 §2-라)." variant="bordered">
                <Stack gap="sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm">이 서비스는 고위험 서비스에 해당</span>
                    <div className="flex shrink-0 overflow-hidden rounded-md border text-xs">
                      {([[true, "예"], [false, "아니오"]] as const).map(([v, label]) => (
                        <button key={label} onClick={() => setHighImpact(v)} className={`px-3 py-1.5 transition-colors ${highImpact === v ? "bg-foreground text-background" : "hover:bg-muted"}`}>{label}</button>
                      ))}
                    </div>
                  </div>
                  {highImpact && <textarea value={hiReason} onChange={(e) => setHiReason(e.target.value)} placeholder="판단 근거 (예: 신용평가·여신심사 등 고객 권익에 중대한 영향)" rows={2} className="w-full rounded-md border bg-transparent px-3 py-2 text-sm duration-200 animate-in fade-in" />}
                </Stack>
              </SectionCard>

              <SectionCard title="정성 평가가 필요한 항목" description="자동 측정(eval)되지 않는 항목을 서술로 평가합니다. 총점·등급은 자동 측정 항목의 객관 지표로만 산정되며, 아래 서술은 보고서에 정성 평가로 실립니다." variant="bordered">
                <Stack gap="md">
                  {(() => {
                    const blocks = RISK_SECTIONS
                      .map((sec) => ({ sec, items: sec.items.filter((it) => state.riskItems[it.key]?.source !== "eval") }))
                      .filter((b) => b.items.length > 0);
                    if (blocks.length === 0) return <Text variant="caption" as="p">현재 모든 항목이 자동 평가되어 수동 입력이 필요한 항목이 없습니다.</Text>;
                    return blocks.map(({ sec, items }) => (
                      <div key={sec.key}>
                        <Text variant="body" as="p" className="mb-2 border-b pb-1.5 font-medium">{sec.label} <span className="text-xs text-muted-foreground">가중 {sec.weight}%</span></Text>
                        <Stack gap="sm">
                          {items.map((item) => {
                            const st = state.riskItems[item.key];
                            const isProvider = st?.source === "provider";
                            const ov = overrides[item.key] ?? {};
                            const filled = !!(ov.note ?? "").trim();
                            return (
                              <div key={item.key} className={`rounded-lg border p-3 transition-colors ${filled ? "border-l-2 border-l-foreground" : ""}`}>
                                <Text variant="caption" as="p" className="font-medium text-foreground">{item.label}{isProvider && <span className="ml-1.5 text-xs font-normal text-muted-foreground">· 외부 공급자 신호 감지</span>}</Text>
                                <p className="mb-2 mt-0.5 text-xs leading-relaxed text-muted-foreground">평가 관점: {item.scoringGuide}</p>
                                <textarea value={ov.note ?? ""} rows={2}
                                  placeholder="이 항목을 어떻게 평가했는지 서술 (예: 위탁계약에 손해배상·SLA 조항 포함, 분기별 수탁기관 점검 운영…)"
                                  onChange={(e) => setOverride(item.key, { note: e.target.value || undefined })}
                                  className="w-full rounded border bg-transparent px-2 py-1.5 text-sm leading-relaxed" />
                              </div>
                            );
                          })}
                        </Stack>
                      </div>
                    ));
                  })()}
                </Stack>
              </SectionCard>

              <SectionCard title="거버넌스 체계 점검" description="조직·정책 측면 정성 평가 (이행/부분/미흡 + 서술). 등급 점수에는 반영되지 않으며 보고서 Ⅲ에 기재됩니다." variant="bordered">
                <Stack gap="sm">
                  {GOVERNANCE_ITEMS.map((g) => {
                    const cur = governance[g.key];
                    const filled = !!(cur?.note ?? "").trim();
                    return (
                      <div key={g.key} className={`rounded-lg border p-3 transition-colors ${filled ? "border-l-2 border-l-foreground" : ""}`}>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Text variant="caption" as="p" className="font-medium text-foreground">{g.label}</Text>
                            <p className="text-xs leading-relaxed text-muted-foreground">{g.description}</p>
                          </div>
                          <div className="flex shrink-0 overflow-hidden rounded-md border text-xs">
                            {CHECK_STATUS.map((cs) => {
                              const active = (cur?.status ?? "done") === cs.v;
                              return <button key={cs.v} onClick={() => setChecklist("gov", g.key, { status: cs.v })} className={`px-2 py-1 transition-colors ${active ? "bg-foreground text-background" : "hover:bg-muted"}`}>{cs.label}</button>;
                            })}
                          </div>
                        </div>
                        <textarea value={cur?.note ?? ""} rows={1} placeholder="이행 현황·증빙 서술 (예: AI윤리위원회 분기 개최, 위원장 CEO 정기보고)" onChange={(e) => setChecklist("gov", g.key, { note: e.target.value })} className="w-full rounded border bg-transparent px-2 py-1.5 text-sm" />
                      </div>
                    );
                  })}
                </Stack>
              </SectionCard>

              <SectionCard title="위험통제 점검" description="통제·운영 측면 정성 평가. '자동 증빙' 항목은 플랫폼 데이터로 뒷받침되며, 필요 시 보완 서술을 추가하세요. 보고서 Ⅳ에 기재됩니다." variant="bordered">
                <Stack gap="sm">
                  {CONTROL_ITEMS.map((c) => {
                    const cur = controls[c.key];
                    const filled = !!(cur?.note ?? "").trim();
                    return (
                      <div key={c.key} className={`rounded-lg border p-3 transition-colors ${filled ? "border-l-2 border-l-foreground" : ""}`}>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Text variant="caption" as="p" className="font-medium text-foreground">{c.label}{c.autoEvidenced && <span className="ml-1.5 text-xs font-normal text-muted-foreground">· 자동 증빙</span>}</Text>
                            <p className="text-xs leading-relaxed text-muted-foreground">{c.description}</p>
                          </div>
                          <div className="flex shrink-0 overflow-hidden rounded-md border text-xs">
                            {CHECK_STATUS.map((cs) => {
                              const active = (cur?.status ?? "done") === cs.v;
                              return <button key={cs.v} onClick={() => setChecklist("ctrl", c.key, { status: cs.v })} className={`px-2 py-1 transition-colors ${active ? "bg-foreground text-background" : "hover:bg-muted"}`}>{cs.label}</button>;
                            })}
                          </div>
                        </div>
                        <textarea value={cur?.note ?? ""} rows={1} placeholder="이행 현황·증빙 서술" onChange={(e) => setChecklist("ctrl", c.key, { note: e.target.value })} className="w-full rounded border bg-transparent px-2 py-1.5 text-sm" />
                      </div>
                    );
                  })}
                </Stack>
              </SectionCard>

              <div className="sticky bottom-0 z-10 -mx-6 flex items-center justify-between gap-3 border-t bg-background/90 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="tabular-nums">총점 <b className="text-foreground">{score.total}</b>/100 · <span style={{ color: gradeColor(score.grade) }}>{score.grade}위험</span></span>
                  <span className="h-3 w-px bg-border" />
                  <span className="tabular-nums">정성 입력 <b className="text-foreground">{qualProgress.filled}</b>/{qualProgress.total}</span>
                  {savedTick && <span className="inline-flex items-center gap-1 duration-200 animate-in fade-in" style={{ color: "#10b981" }}>✓ 저장됨</span>}
                </div>
                <button onClick={() => void saveAssessment()} disabled={savingAssessment} className="flex shrink-0 items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/80 disabled:opacity-40"><Save className="h-4 w-4" /> {savingAssessment ? "저장 중…" : "평가 저장"}</button>
              </div>

              <ModalShell open={showSaved} onClose={() => setShowSaved(false)} size="sm">
                <ModalHeader title="평가가 저장되었습니다" description="입력한 정성 평가가 이 프로젝트에 저장되어 보고서·대시보드에 반영됩니다." />
                <div className="mt-3 flex justify-end">
                  <button onClick={() => setShowSaved(false)} className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/80">확인</button>
                </div>
              </ModalShell>
            </Stack>
          ) : (
            <Stack gap="lg">
              <SectionCard title="감독 제출용 보고서" description={`현재 등급 ${score.grade}위험 · 총점 ${score.total}/100 · 트레이스 ${trees.length}건`} variant="bordered" actions={
                <button onClick={() => { setViewSnap(null); void saveVersion(); setMode("preview"); }} disabled={loading || saving} className="flex shrink-0 items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/80 disabled:opacity-40">
                  <FileDown className="h-4 w-4" /> {saving ? "생성·저장 중…" : "보고서 생성하기"}
                </button>
              }>
                <Text variant="caption" as="p">아래 옵션으로 A4 문서를 생성하고 인쇄(PDF 저장)합니다.</Text>
              </SectionCard>

              <SectionCard title="출력 설정" variant="bordered">
                <div className="grid grid-cols-1 gap-x-8 gap-y-3 text-xs md:grid-cols-2">
                  <label className="flex items-center justify-between gap-2"><span className="text-muted-foreground">평가 기간</span><DateRangePicker value={dateRange} onChange={setDateRange} /></label>
                  <label className="flex items-center justify-between gap-2"><span className="text-muted-foreground">지적사항 항목당 표시</span><input type="number" min={1} max={50} value={findingsCap} onChange={(e) => setFindingsCap(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="w-20 rounded border px-2 py-1 tabular-nums" /></label>
                  <label className="flex items-center justify-between gap-2"><span className="text-muted-foreground">기관/제출처</span><input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="예: 금융감독원" className="w-44 rounded border px-2 py-1" /></label>
                  <label className="flex items-center justify-between gap-2"><span className="text-muted-foreground">평가자</span><input value={assessor} onChange={(e) => setAssessor(e.target.value)} placeholder="작성자명" className="w-44 rounded border px-2 py-1" /></label>
                </div>
              </SectionCard>

              <SectionCard title="포함할 섹션" variant="bordered">
                <div className="flex flex-wrap gap-2 text-xs">
                  {SECTION_LABELS.map((s) => (
                    <label key={s.key} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 ${sections[s.key] ? "border-foreground" : ""}`}>
                      <input type="checkbox" checked={sections[s.key]} onChange={(e) => setSections((prev) => ({ ...prev, [s.key]: e.target.checked }))} className="rounded" />{s.label}
                    </label>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="저장된 보고서 버전" description={`${versions.length}개 · 보고서 생성 시 자동 저장`} variant="bordered">
                {versions.length === 0 ? (
                  <Text variant="caption" as="p">아직 저장된 버전이 없습니다. 「보고서 생성하기」를 누르면 자동 저장됩니다.</Text>
                ) : (
                  <Stack gap="xs">
                    {versions.map((v) => (
                      <div key={v.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: gradeColor(v.grade as Grade) }}>{v.grade}위험</span>
                            <span className="font-medium tabular-nums">{v.total}점</span>
                            <span className="text-muted-foreground">· 지적 {Object.values((v.snapshot?.findingsByItem ?? {}) as Record<string, unknown[]>).reduce((a, arr) => a + (arr?.length ?? 0), 0)}건</span>
                          </div>
                          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">v{v.version} · {new Date(v.createdAt).toLocaleString("ko-KR")}{v.label ? ` · ${v.label}` : ""}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button onClick={() => { setViewSnap({ version: v.version, snapshot: v.snapshot }); setMode("preview"); }} className="rounded-md border px-2.5 py-1 font-medium transition hover:bg-muted">보기</button>
                          <button onClick={() => deleteVersion(v.id)} className="rounded-md border p-1.5 text-muted-foreground transition hover:bg-muted" title="삭제"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </Stack>
                )}
              </SectionCard>
            </Stack>
          )}
        </div>
      </div>
    );
  }
  // ─── 문서(미리보기 + PDF) 단계 ───
  return (
    <div className="mx-auto max-w-[880px] p-6">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <button onClick={() => { setViewSnap(null); setMode("config"); }} className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition hover:bg-muted"><ArrowLeft className="h-4 w-4" /> 대시보드로</button>
        <div className="flex items-center gap-2">
          {viewSnap && <span className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">저장본 v{viewSnap.version} 보기 중</span>}
          <button onClick={() => {
            const safe = String(phoenixProject || "report").replace(/[\\/:*?"<>|\s]+/g, "_");
            const prev = document.title;
            document.title = `RMF_${safe}_${fmtDate(generatedAt)}`;
            const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
            window.addEventListener("afterprint", restore);
            window.print();
          }} className="flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/80"><FileDown className="h-4 w-4" /> PDF 출력</button>
        </div>
      </div>
      <div className="rmf-report rounded-lg border bg-white p-10 text-[13px] leading-relaxed text-neutral-900 shadow-sm">
        <div className="rmf-head mb-6 border-b-2 border-neutral-800 pb-4 text-center">
          <p className="text-[11px] tracking-wide text-neutral-500">금융분야 AI 위험관리 프레임워크(AI RMF) · 금융감독원 체계 기준{dOrg ? ` · 제출: ${dOrg}` : ""}</p>
          <h1 className="mt-2 text-2xl font-bold">AI 위험평가 보고서</h1>
          <table className="mx-auto mt-4 text-[12px]">
            <tbody>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">대상 서비스</td><td className="px-3 py-0.5 text-left font-semibold">{phoenixProject}</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">평가 기간</td><td className="px-3 py-0.5 text-left">{fmtDate(dFrom)} ~ {fmtDate(dTo)}</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">분석 트레이스</td><td className="px-3 py-0.5 text-left">{dTraceCount}건</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">고위험 서비스</td><td className="px-3 py-0.5 text-left">{dHighImpact ? <span className="font-semibold" style={{ color: "#ef4444" }}>해당{dHiReason ? ` — ${dHiReason}` : ""}</span> : "비해당"}</td></tr>
              {dAssessor && <tr><td className="px-3 py-0.5 text-right text-neutral-500">평가자</td><td className="px-3 py-0.5 text-left">{dAssessor}</td></tr>}
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">생성일</td><td className="px-3 py-0.5 text-left">{fmtDate(generatedAt)}</td></tr>
            </tbody>
          </table>
        </div>
        {body}
      </div>
    </div>
  );
}
