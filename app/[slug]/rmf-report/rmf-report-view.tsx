"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { FileDown, ArrowLeft, Save, Trash2, Sparkles, Clock, Cpu, Coins } from "lucide-react";
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
import { LoadingState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { AnnotationBadge, AnnotationBadges } from "@/components/annotation-badge";
import { formatSec } from "@/components/trace-tree/span-tree-helpers";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { RISK_SECTIONS, GOVERNANCE_ITEMS, CONTROL_ITEMS, CONTROL_MATRIX } from "@/lib/rmf/finance-rmf";
import { prefillRiskItems, extractFindings } from "@/lib/rmf/finance-prefill";
import { computeFinanceRisk } from "@/lib/rmf/finance-score";
import type { AssessmentState, Finding, Grade, ScoreResult } from "@/lib/rmf/types";

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
@page { size: A4; margin: 14mm; }
@media print {
  body * { visibility: hidden !important; }
  .rmf-report, .rmf-report * { visibility: visible !important; }
  .rmf-report { position: absolute !important; left: 0; top: 0; width: 100% !important; margin: 0 !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
  .no-print { display: none !important; }
  .page-break { break-before: page; }
  table, .avoid-break { break-inside: avoid; }
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
          <div className="text-4xl font-extrabold" style={{ color: gradeColor(score.grade) }}>{score.grade}위험</div>
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
        <p className="mt-1 text-[10px] text-neutral-500">※ "-"는 자동 측정 데이터가 없어 미평가(수동 평가 필요)임을 의미.</p>
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
                        <span className="text-neutral-600">{st && st.source !== "manual" ? <>인식·측정 {st.inherent} · 경감 {st.mitigation} · <b>잔여 {score.perItemResidual[item.key] ?? 0}</b> / {item.maxInherent} · 지적 {itemFindings.length}건</> : <span className="text-neutral-400">미측정 / {item.maxInherent}</span>}</span>
                      </div>
                      <p className="mt-1 text-neutral-500">근거: {item.providerSignal ? "외부 LLM 공급자 설정 신호" : m && !m.noData ? metricLabel(item.evalMetricId) + " " + m.value.toFixed(1) + "%" : "eval 데이터 없음 — 수동 평가 필요"}<span className="ml-1 text-neutral-400">· 채점기준: {item.scoringGuide}</span></p>
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
            {GOVERNANCE_ITEMS.map((g) => (
              <li key={g.key} className="border-b pb-1.5"><b>{g.label}</b> <span className="rounded bg-neutral-200 px-1 text-[9px] text-neutral-600">자기선언</span><p className="text-neutral-600">{g.description}</p></li>
            ))}
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
            {CONTROL_ITEMS.map((c) => (
              <li key={c.key} className="border-b pb-1.5">
                <b>{c.label}</b>{" "}
                {c.autoEvidenced ? <span className="rounded px-1 text-[9px]" style={{ background: "#10b981", color: "#fff" }}>자동 증빙</span> : <span className="rounded bg-neutral-200 px-1 text-[9px] text-neutral-600">자기선언</span>}
                {c.key === "monitoring" && <span className="ml-1 text-neutral-500">(평가기간 {traceCount}개 트레이스 자동 모니터링)</span>}
                <p className="text-neutral-600">{c.description}</p>
              </li>
            ))}
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
            <li>위탁/관리는 외부 LLM 공급자 사용 여부로 자동 신호화. 거버넌스·교육·보고는 자기선언.</li>
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
  const [tab, setTab] = useState<"dashboard" | "output">("dashboard");
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange(30));
  const [orgName, setOrgName] = useState("");
  const [assessor, setAssessor] = useState("");
  const [findingsCap, setFindingsCap] = useState(8);
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
    highImpact: false, riskItems: prefillRiskItems(metrics, hasProvider), governance: {}, controls: {},
  }), [metrics, hasProvider]);

  const score = useMemo(() => computeFinanceRisk(state), [state]);
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
      const snapshot = { score, riskItems: state.riskItems, findingsByItem, traceCount: trees.length, sections, orgName, assessor, periodFrom: dateRange.from?.toISOString(), periodTo: dateRange.to?.toISOString() };
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

  // ── AI 개선 제안 (LLM) ──
  const [recs, setRecs] = useState("");
  const [recsLoading, setRecsLoading] = useState(false);
  async function generateRecommendations() {
    if (!projectId) return;
    setRecsLoading(true);
    try {
      const lines: string[] = [
        `대상 서비스: ${phoenixProject}`,
        `종합 위험등급: ${score.grade}위험 (잔여위험 총점 ${score.total}/100)`,
        "부문별 잔여위험(소계/만점):",
        ...RISK_SECTIONS.map((sec) => `- ${sec.label}: ${score.sectionSubtotals[sec.key] ?? 0}/${sec.weight}`),
        `주요 지적사항(${findings.length}건 중 상위):`,
        ...findings.slice(0, 25).map((f) => `- [${ITEM_LABEL[f.itemKey] ?? f.itemKey}] ${f.eval}: ${f.reason || f.label}`),
      ];
      const r = await apiFetch("/api/llm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini", projectId, promptLabel: "rmf-improvement", temperature: 0.3,
          messages: [
            { role: "system", content: "당신은 금융 AI 위험관리(금융감독원 AI RMF) 전문가입니다. 아래 평가 결과를 보고, 위험을 낮추기 위한 우선순위 있는 구체적·실행가능한 개선 권고를 한국어로 제시하세요. 각 권고는 '무엇을/왜/어떻게'가 드러나게 간결히, 번호 목록으로. 위험이 높은 부문·항목을 우선." },
            { role: "user", content: lines.join("\n") },
          ],
        }),
      });
      if (r.ok) { const d = await r.json(); setRecs(d.choices?.[0]?.message?.content ?? "(응답이 비어 있습니다)"); }
      else setRecs("생성 실패 — 프로젝트 LLM 키 설정을 확인하세요.");
    } catch (e) { logger.error("rmf recommendations failed", e); setRecs("생성 실패"); }
    setRecsLoading(false);
  }

  // 문서 렌더 소스: 저장본(viewSnap) 보기 중이면 그 스냅샷, 아니면 라이브
  const snap = viewSnap?.snapshot ?? null;
  const dScore: ScoreResult = snap ? snap.score : score;
  const dState: AssessmentState = snap ? { highImpact: false, riskItems: snap.riskItems, governance: {}, controls: {} } : state;
  const dMetricById = (snap ? new Map() : metricById) as typeof metricById;
  const dFindingsByItem: Record<string, Finding[]> = snap ? snap.findingsByItem : findingsByItem;
  const dFindingQuery = snap ? () => "" : findingQuery;
  const dTraceCount: number = snap ? snap.traceCount : trees.length;
  const dSections: Record<SectionKey, boolean> = snap ? snap.sections : sections;
  const dOrg: string = snap ? (snap.orgName ?? "") : orgName;
  const dAssessor: string = snap ? (snap.assessor ?? "") : assessor;
  const dFrom = snap ? (snap.periodFrom ? new Date(snap.periodFrom) : undefined) : dateRange.from;
  const dTo = snap ? (snap.periodTo ? new Date(snap.periodTo) : undefined) : dateRange.to;

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
            {([["dashboard", "대시보드"], ["output", "보고서 출력"]] as const).map(([k, label]) => (
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
                            <div className="w-36 shrink-0 font-mono text-[11px]">{name}</div>
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
                                  <div className="flex cursor-help flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:border-foreground/30">
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
                                          <span className="text-[11px] font-medium" style={{ color }}>{ratioLabel(rr)}</span>
                                        </div>
                                        <div className="relative h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: pct + "%", background: color }} /></div>
                                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
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

              <SectionCard title="문제되는 트레이스" description={`지적이 탐지된 트레이스 ${problematicTraces.length}건 (요청·응답 및 지적 사유)`} variant="bordered">
                {problematicTraces.length === 0 ? (
                  <Text variant="caption" as="p">자동 탐지된 지적 사항이 없습니다.</Text>
                ) : (
                  <Stack gap="sm">
                    {problematicTraces.slice(0, 15).map(({ tree, findings: tf }) => {
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
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
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

              <SectionCard title="AI 개선 제안" description="평가 결과·지적사항 기반 개선 권고 (LLM 생성)" variant="bordered" actions={
                <button onClick={generateRecommendations} disabled={recsLoading} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-40"><Sparkles className="h-3.5 w-3.5" /> {recsLoading ? "생성 중…" : recs ? "다시 생성" : "개선 제안 생성"}</button>
              }>
                {recs
                  ? <Text variant="caption" as="p" className="whitespace-pre-wrap leading-relaxed text-foreground">{recs}</Text>
                  : <Text variant="caption" as="p">「개선 제안 생성」을 누르면 평가 결과와 지적사항을 바탕으로 위험을 낮추기 위한 개선 권고를 LLM이 생성합니다.</Text>}
              </SectionCard>
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
          {viewSnap
            ? <span className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">저장본 v{viewSnap.version} 보기 중</span>
            : <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground" style={{ borderColor: "#10b981", color: "#10b981" }}><Save className="mr-1 inline h-3 w-3" />생성 시 자동 저장됨</span>}
          <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/80"><FileDown className="h-4 w-4" /> PDF 출력</button>
        </div>
      </div>
      <div className="rmf-report rounded-lg border bg-white p-10 text-[13px] leading-relaxed text-neutral-900 shadow-sm">
        <div className="mb-6 border-b-2 border-neutral-800 pb-4 text-center">
          <p className="text-[11px] tracking-wide text-neutral-500">금융분야 AI 위험관리 프레임워크(AI RMF) · 금융감독원 체계 기준{dOrg ? ` · 제출: ${dOrg}` : ""}</p>
          <h1 className="mt-2 text-2xl font-bold">AI 위험평가 보고서</h1>
          <table className="mx-auto mt-4 text-[12px]">
            <tbody>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">대상 서비스</td><td className="px-3 py-0.5 text-left font-semibold">{phoenixProject}</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">평가 기간</td><td className="px-3 py-0.5 text-left">{fmtDate(dFrom)} ~ {fmtDate(dTo)}</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">분석 트레이스</td><td className="px-3 py-0.5 text-left">{dTraceCount}건</td></tr>
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
