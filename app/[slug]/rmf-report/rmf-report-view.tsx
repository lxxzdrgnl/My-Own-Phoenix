"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown, ArrowLeft } from "lucide-react";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { logger } from "@/lib/logger";
import { fetchSpansAndAnnotations, buildTraceTrees, type RawSpan, type Annotation, type TraceTree } from "@/lib/phoenix";
import { extractInputPreview } from "@/lib/span-extraction";
import { computeMetrics, MEASURE_METRICS } from "@/lib/rmf-utils";
import type { SpanData, AnnotationData } from "@/lib/dashboard-utils";
import { DateRangePicker, getPresetRange, type DateRange } from "@/components/ui/date-range-picker";
import { Heading, Text } from "@/components/ui/typography";
import { Stack, Inline } from "@/components/ui/stack";
import { SectionCard } from "@/components/ui/section-card";
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

function SourceBadge({ source }: { source?: string }) {
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

  const body = (
    <RmfBody score={score} state={state} metricById={metricById} findingsByItem={findingsByItem}
      findingQuery={findingQuery} traceCount={trees.length} sections={sections} findingsCap={findingsCap} />
  );

  // ─── 대시보드 단계 (앱 스타일 — human-review 참고) ───
  if (mode === "config") {
    return (
      <div className="mx-auto max-w-[1100px] p-6">
        <Inline gap="sm" className="mb-5 justify-between flex-wrap" align="start">
          <Stack gap="xs">
            <Heading level="page" as="h1" className="text-xl">금융 AI RMF 위험평가</Heading>
            <Text variant="caption" as="p">{phoenixProject} · 최근 위험 현황을 확인하고 감독 제출용 보고서를 생성하세요</Text>
          </Stack>
          <button onClick={() => setMode("preview")} disabled={loading} className="flex shrink-0 items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/80 disabled:opacity-40">
            <FileDown className="h-4 w-4" /> 보고서 생성하기
          </button>
        </Inline>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">불러오는 중…</div>
        ) : (
          <div className="space-y-4">
            {/* 히어로: 등급 + 게이지 + 핵심 수치 */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold" style={{ color: gradeColor(score.grade) }}>{score.grade}위험</span>
                  <span className="text-sm text-muted-foreground">잔여위험 총점 <b className="text-foreground">{score.total}</b> / 100</span>
                </div>
                <div className="flex gap-6">
                  <div className="text-right"><p className="text-xs text-muted-foreground">분석 트레이스</p><p className="text-lg font-semibold">{trees.length}</p></div>
                  <div className="text-right"><p className="text-xs text-muted-foreground">지적 사항</p><p className="text-lg font-semibold">{findings.length}건</p></div>
                </div>
              </div>
              <div className="mt-4 flex overflow-hidden rounded-full border text-center text-[11px]">
                {GRADES.map((g) => (
                  <div key={g} className="flex-1 py-1.5" style={{ background: g === score.grade ? gradeColor(g) : "transparent", color: g === score.grade ? "#fff" : "#737373", fontWeight: g === score.grade ? 700 : 400 }}>{g}위험 ({GRADE_RANGE[g]})</div>
                ))}
              </div>
            </div>

            {/* 용어 안내 */}
            <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">평가 방식 안내</span> — 각 항목의 <b>고유위험(인식·측정)</b>에서 통제로 줄인 <b>경감</b>을 뺀 값이 <b className="text-foreground">잔여위험</b>입니다. 모든 항목의 잔여위험을 합산(0–100점)해 <b>위험등급</b>(저/중/고/초고)을 산정합니다. 표기 <b className="text-foreground">잔여 X/Y</b> = 남은 위험 X점(항목 최대 Y점) — <span style={{ color: "#10b981" }}>0에 가까울수록 안전</span>, <span style={{ color: "#ef4444" }}>Y에 가까울수록 위험</span>.
            </div>

            {/* 차트 2단 */}
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="부문별 위험도" variant="bordered">
                <Stack gap="sm">
                  {RISK_SECTIONS.map((sec) => {
                    const sub = score.sectionSubtotals[sec.key] ?? 0;
                    const ratio = sec.weight > 0 ? sub / sec.weight : 0;
                    const pct = Math.min(100, Math.round(ratio * 100));
                    const color = ratioColor(ratio);
                    const fc = sec.items.reduce((a, it) => a + (findingsByItem[it.key]?.length ?? 0), 0);
                    return (
                      <div key={sec.key} className="flex items-center gap-3 text-xs">
                        <div className="w-24 shrink-0 font-medium">{sec.label} <span className="text-muted-foreground">({sec.weight}%)</span></div>
                        <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: pct + "%", background: color }} /></div>
                        <div className="w-24 shrink-0 text-right"><span className="font-medium" style={{ color }}>{ratioLabel(ratio)}</span><span className="text-muted-foreground"> · {sub}/{sec.weight}</span></div>
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
                          <div className="relative h-4 flex-1 overflow-hidden rounded bg-muted"><div className="h-full rounded" style={{ width: Math.round((count / max) * 100) + "%", background: "#ef4444" }} /></div>
                          <div className="w-8 shrink-0 text-right tabular-nums">{count}</div>
                        </div>
                      );
                    })}
                  </Stack>
                )}
              </SectionCard>
            </div>

            {/* 위험평가 항목 */}
            <SectionCard title="위험평가 항목 (7대 원칙)" variant="bordered">
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
                {RISK_SECTIONS.map((sec) => (
                  <div key={sec.key}>
                    <Text variant="body" as="p" className="mb-1.5 font-medium">{sec.label} <span className="text-xs text-muted-foreground">({sec.weight}%)</span></Text>
                    <Stack gap="xs">
                      {sec.items.map((item) => {
                        const st = state.riskItems[item.key];
                        const measured = !!st && st.source !== "manual";
                        const residual = score.perItemResidual[item.key] ?? 0;
                        const rr = item.maxInherent > 0 ? residual / item.maxInherent : 0;
                        const fc = findingsByItem[item.key]?.length ?? 0;
                        return (
                          <div key={item.key} className="flex items-center justify-between gap-2 text-xs">
                            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: measured ? ratioColor(rr) : "#d4d4d8" }} />{item.label}</span>
                            <span className="text-muted-foreground">{measured ? `잔여 ${residual}/${item.maxInherent}` : "미측정"}{fc > 0 ? ` · 지적 ${fc}` : ""}</span>
                          </div>
                        );
                      })}
                    </Stack>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* 문제되는 트레이스 */}
            <SectionCard title="문제되는 트레이스" description={`지적이 탐지된 트레이스 ${problematicTraces.length}건 (지적 많은 순)`} variant="bordered">
              {problematicTraces.length === 0 ? (
                <Text variant="caption" as="p">자동 탐지된 지적 사항이 없습니다.</Text>
              ) : (
                <Stack gap="sm">
                  {problematicTraces.slice(0, 12).map(({ tree, findings: tf }) => {
                    const q = traceQuery.get(tree.traceId) || "(질의 없음)";
                    const evals = Array.from(new Set(tf.map((f) => f.eval)));
                    const hasHuman = tf.some((f) => f.annotatorKind === "HUMAN");
                    return (
                      <div key={tree.traceId} className="rounded-lg border p-3">
                        <Inline gap="sm" className="justify-between" align="start">
                          <Text variant="body" as="p" className="line-clamp-1 font-medium">{q.length > 90 ? q.slice(0, 90) + "…" : q}</Text>
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: "#ef4444" }}>지적 {tf.length}{hasHuman ? " · 사람" : ""}</span>
                        </Inline>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {evals.map((e) => <span key={e} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{e}</span>)}
                        </div>
                        <Stack gap="xs" className="mt-1.5">
                          {tf.slice(0, 3).map((f, i) => (
                            <Text key={i} variant="caption" as="p" className="line-clamp-2">
                              <span className="text-foreground/70">[{ITEM_LABEL[f.itemKey] ?? f.itemKey}]</span>{f.annotatorKind === "HUMAN" ? " (사람평가)" : ""} {f.reason || f.label}
                            </Text>
                          ))}
                          {tf.length > 3 && <Text variant="caption" as="p">…외 {tf.length - 3}건</Text>}
                        </Stack>
                      </div>
                    );
                  })}
                </Stack>
              )}
            </SectionCard>

            {/* 보고서 출력 옵션 */}
            <SectionCard title="보고서 출력 옵션" description="생성할 보고서에 반영됩니다" variant="bordered">
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-xs md:grid-cols-2">
                <label className="flex items-center justify-between gap-2"><span className="text-muted-foreground">평가 기간</span><DateRangePicker value={dateRange} onChange={setDateRange} /></label>
                <label className="flex items-center justify-between gap-2"><span className="text-muted-foreground">지적사항 항목당 표시</span><input type="number" min={1} max={50} value={findingsCap} onChange={(e) => setFindingsCap(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="w-20 rounded border px-2 py-1" /></label>
                <label className="flex items-center justify-between gap-2"><span className="text-muted-foreground">기관/제출처</span><input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="예: 금융감독원" className="w-44 rounded border px-2 py-1" /></label>
                <label className="flex items-center justify-between gap-2"><span className="text-muted-foreground">평가자</span><input value={assessor} onChange={(e) => setAssessor(e.target.value)} placeholder="작성자명" className="w-44 rounded border px-2 py-1" /></label>
              </div>
              <div className="mt-3 border-t pt-3">
                <Text variant="caption" as="p" className="mb-2">포함할 섹션</Text>
                <div className="flex flex-wrap gap-3 text-xs">
                  {SECTION_LABELS.map((s) => (
                    <label key={s.key} className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={sections[s.key]} onChange={(e) => setSections((prev) => ({ ...prev, [s.key]: e.target.checked }))} className="rounded" />{s.label}</label>
                  ))}
                </div>
              </div>
            </SectionCard>
          </div>
        )}
      </div>
    );
  }
  // ─── 문서(미리보기 + PDF) 단계 ───
  return (
    <div className="mx-auto max-w-[880px] p-6">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <button onClick={() => setMode("config")} className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition hover:bg-muted"><ArrowLeft className="h-4 w-4" /> 대시보드로</button>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/80"><FileDown className="h-4 w-4" /> PDF 출력</button>
      </div>
      <div className="rmf-report rounded-lg border bg-white p-10 text-[13px] leading-relaxed text-neutral-900 shadow-sm">
        <div className="mb-6 border-b-2 border-neutral-800 pb-4 text-center">
          <p className="text-[11px] tracking-wide text-neutral-500">금융분야 AI 위험관리 프레임워크(AI RMF) · 금융감독원 체계 기준{orgName ? ` · 제출: ${orgName}` : ""}</p>
          <h1 className="mt-2 text-2xl font-bold">AI 위험평가 보고서</h1>
          <table className="mx-auto mt-4 text-[12px]">
            <tbody>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">대상 서비스</td><td className="px-3 py-0.5 text-left font-semibold">{phoenixProject}</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">평가 기간</td><td className="px-3 py-0.5 text-left">{fmtDate(dateRange.from)} ~ {fmtDate(dateRange.to)}</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">분석 트레이스</td><td className="px-3 py-0.5 text-left">{trees.length}건</td></tr>
              {assessor && <tr><td className="px-3 py-0.5 text-right text-neutral-500">평가자</td><td className="px-3 py-0.5 text-left">{assessor}</td></tr>}
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">생성일</td><td className="px-3 py-0.5 text-left">{fmtDate(generatedAt)}</td></tr>
            </tbody>
          </table>
        </div>
        {body}
      </div>
    </div>
  );
}
