"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { logger } from "@/lib/logger";
import { fetchSpansAndAnnotations, buildTraceTrees, type RawSpan, type Annotation } from "@/lib/phoenix";
import { computeMetrics, MEASURE_METRICS } from "@/lib/rmf-utils";
import type { SpanData, AnnotationData } from "@/lib/dashboard-utils";
import { RISK_SECTIONS, GOVERNANCE_ITEMS, CONTROL_ITEMS, CONTROL_MATRIX } from "@/lib/rmf/finance-rmf";
import { prefillRiskItems, extractFindings } from "@/lib/rmf/finance-prefill";
import { computeFinanceRisk } from "@/lib/rmf/finance-score";
import type { AssessmentState, Finding, Grade } from "@/lib/rmf/types";

const GRADES: Grade[] = ["저", "중", "고", "초고"];
const GRADE_RANGE: Record<Grade, string> = { 저: "0–24", 중: "25–49", 고: "50–74", 초고: "75–100" };
function gradeColor(g: Grade): string {
  if (g === "초고" || g === "고") return "#ef4444";
  if (g === "저") return "#10b981";
  return "#525252";
}
const metricLabel = (id?: string) => MEASURE_METRICS.find((m) => m.id === id)?.label ?? "";

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

function SourceBadge({ source }: { source?: string }) {
  if (source === "eval") return <span className="rounded px-1 text-[9px]" style={{ background: "#10b981", color: "#fff" }}>자동·eval</span>;
  if (source === "provider") return <span className="rounded bg-neutral-700 px-1 text-[9px] text-white">공급자 신호</span>;
  return <span className="rounded bg-neutral-200 px-1 text-[9px] text-neutral-600">수동</span>;
}

export function RmfReportView() {
  const { phoenixProject, id: projectId } = useProject();
  const [loading, setLoading] = useState(true);
  const [annMap, setAnnMap] = useState<Record<string, Annotation[]>>({});
  const [trees, setTrees] = useState<ReturnType<typeof buildTraceTrees>>([]);
  const [hasProvider, setHasProvider] = useState(false);

  const periodTo = useMemo(() => new Date(), []);
  const periodFrom = useMemo(() => new Date(Date.now() - 30 * 86400000), []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const { allSpans, annMap } = await fetchSpansAndAnnotations(
          phoenixProject, periodFrom.toISOString(), periodTo.toISOString(), undefined, 1000,
        );
        if (!active) return;
        setAnnMap(annMap);
        setTrees(buildTraceTrees(allSpans, annMap));
      } catch (e) { logger.error("rmf-report load failed", e); }
      try {
        if (projectId) {
          const r = await apiFetch(`/api/projects/${projectId}/providers`);
          if (r.ok) {
            const d = await r.json();
            const list = d.items ?? d.providers ?? [];
            if (active) setHasProvider(list.some((p: { isActive?: boolean }) => p.isActive));
          }
        }
      } catch { /* ignore */ }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [phoenixProject, projectId, periodFrom, periodTo]);

  const metrics = useMemo(() => {
    if (!trees.length) return computeMetrics([], []);
    const spanData = trees.flatMap((t) => { const s = collectSpans(t.rootSpan); s[0].time = t.time; return s; });
    const annData: AnnotationData[] = trees.flatMap((t) => t.rootSpan.annotations.map((a) => ({ ...a, time: t.time })));
    return computeMetrics(spanData, annData);
  }, [trees]);
  const metricById = useMemo(() => new Map(metrics.map((m) => [m.id, m])), [metrics]);

  const state: AssessmentState = useMemo(() => ({
    highImpact: false,
    riskItems: prefillRiskItems(metrics, hasProvider),
    governance: {}, controls: {},
  }), [metrics, hasProvider]);

  const score = useMemo(() => computeFinanceRisk(state), [state]);
  const findings = useMemo(() => extractFindings(annMap), [annMap]);
  const findingsByItem = useMemo(() => {
    const m: Record<string, Finding[]> = {};
    for (const f of findings) (m[f.itemKey] ??= []).push(f);
    return m;
  }, [findings]);

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

  if (loading) return <div className="p-12 text-center text-sm text-muted-foreground">보고서 생성 중…</div>;

  return (
    <div className="mx-auto max-w-[860px] p-6">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">금융 AI RMF 위험평가 보고서</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {phoenixProject} · 평가기간 {fmtDate(periodFrom)} ~ {fmtDate(periodTo)} · 트레이스 {trees.length}건
          </p>
        </div>
        <button onClick={() => window.print()} className="flex shrink-0 items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background transition hover:bg-foreground/80">
          <FileDown className="h-4 w-4" /> PDF 출력
        </button>
      </div>

      <div className="rmf-report rounded-lg border bg-white p-10 text-[13px] leading-relaxed text-neutral-900 shadow-sm">
        <div className="mb-6 border-b-2 border-neutral-800 pb-4 text-center">
          <p className="text-[11px] tracking-wide text-neutral-500">금융분야 AI 위험관리 프레임워크(AI RMF) · 금융감독원 체계 기준</p>
          <h1 className="mt-2 text-2xl font-bold">AI 위험평가 보고서</h1>
          <table className="mx-auto mt-4 text-[12px]">
            <tbody>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">대상 서비스</td><td className="px-3 py-0.5 text-left font-semibold">{phoenixProject}</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">평가 기간</td><td className="px-3 py-0.5 text-left">{fmtDate(periodFrom)} ~ {fmtDate(periodTo)}</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">분석 트레이스</td><td className="px-3 py-0.5 text-left">{trees.length}건</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">생성일</td><td className="px-3 py-0.5 text-left">{fmtDate(periodTo)}</td></tr>
            </tbody>
          </table>
        </div>

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
          <p className="mt-2 text-[11px] text-neutral-500">※ 위험등급은 위험평가(②) 16개 항목 잔여위험 합산으로 산정. 고영향 AI는 최소 고위험. 거버넌스(①)·위험통제(③)는 정성 축으로 등급 미반영.</p>
        </section>

        <section className="avoid-break mb-7">
          <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">Ⅰ. 위험평가 결과 요약 (7대 원칙)</h2>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-neutral-100 text-neutral-700">
                <th className="border px-2 py-1 text-left">부문(가중)</th>
                <th className="border px-2 py-1 text-left">항목</th>
                <th className="border px-2 py-1">인식·측정</th>
                <th className="border px-2 py-1">경감</th>
                <th className="border px-2 py-1">잔여</th>
                <th className="border px-2 py-1">소계</th>
              </tr>
            </thead>
            <tbody>
              {RISK_SECTIONS.map((sec) => sec.items.map((item, i) => (
                <tr key={item.key}>
                  {i === 0 && <td className="border px-2 py-1 align-top font-medium" rowSpan={sec.items.length}>{sec.label} ({sec.weight}%)</td>}
                  <td className="border px-2 py-1">{item.label}</td>
                  <td className="border px-2 py-1 text-center">{state.riskItems[item.key] && state.riskItems[item.key]!.source !== "manual" ? state.riskItems[item.key]!.inherent : "-"}</td>
                  <td className="border px-2 py-1 text-center">{state.riskItems[item.key]?.mitigation ? "(" + state.riskItems[item.key].mitigation + ")" : "-"}</td>
                  <td className="border px-2 py-1 text-center font-medium">{state.riskItems[item.key] && state.riskItems[item.key]!.source !== "manual" ? (score.perItemResidual[item.key] ?? 0) : "-"}</td>
                  {i === 0 && <td className="border px-2 py-1 text-center align-top font-bold" rowSpan={sec.items.length}>{score.sectionSubtotals[sec.key] ?? 0}</td>}
                </tr>
              )))}
              <tr className="bg-neutral-50 font-bold">
                <td className="border px-2 py-1" colSpan={4}>총점</td>
                <td className="border px-2 py-1 text-center" colSpan={2}>{score.total} / 100 → {score.grade}위험</td>
              </tr>
            </tbody>
          </table>
        </section>

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
                        <span className="text-neutral-600">{st && st.source !== "manual" ? <>인식·측정 {st.inherent} · 경감 {st.mitigation} · <b>잔여 {score.perItemResidual[item.key] ?? 0}</b> / {item.maxInherent}</> : <span className="text-neutral-400">미측정 / {item.maxInherent}</span>}</span>
                      </div>
                      <p className="mt-1 text-neutral-500">근거: {item.providerSignal ? "외부 LLM 공급자 설정 신호" : m && !m.noData ? metricLabel(item.evalMetricId) + " " + m.value.toFixed(1) + "%" : "eval 데이터 없음 — 수동 평가 필요"}<span className="ml-1 text-neutral-400">· 채점기준: {item.scoringGuide}</span></p>
                      {itemFindings.length > 0 && (
                        <ul className="mt-1 space-y-0.5 border-t border-dashed pt-1">
                          {itemFindings.slice(0, 8).map((f, idx) => (
                            <li key={idx} className="text-neutral-700">
                              <span className="rounded bg-neutral-100 px-1 font-mono text-[9px]">{f.eval}</span>
                              {f.annotatorKind === "HUMAN" && <span className="ml-1 rounded px-1 text-[9px]" style={{ background: "#10b981", color: "#fff" }}>사람평가</span>}
                              <span className="ml-1">: {f.reason || f.label}</span>
                            </li>
                          ))}
                          {itemFindings.length > 8 && <li className="text-neutral-400">…외 {itemFindings.length - 8}건</li>}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="page-break avoid-break mb-7">
          <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">Ⅲ. 거버넌스 체계 현황</h2>
          <ul className="space-y-1.5 text-[11px]">
            {GOVERNANCE_ITEMS.map((g) => (
              <li key={g.key} className="border-b pb-1.5">
                <b>{g.label}</b> <span className="rounded bg-neutral-200 px-1 text-[9px] text-neutral-600">자기선언</span>
                <p className="text-neutral-600">{g.description}</p>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-neutral-500">※ 거버넌스 기구·전담조직·내규는 조직 사항으로 별도 자기선언 — 감독당국이 내규·조직도 등으로 확인.</p>
        </section>

        <section className="avoid-break mb-7">
          <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">Ⅳ. 위험통제 현황</h2>
          <div className="mb-3 rounded border bg-neutral-50 p-2 text-[11px]">
            <b>등급별 권고 통제 — {score.grade}위험 ({CONTROL_MATRIX[score.grade].title})</b>
            <ul className="ml-4 list-disc">
              {CONTROL_MATRIX[score.grade].measures.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
          <ul className="space-y-1.5 text-[11px]">
            {CONTROL_ITEMS.map((c) => (
              <li key={c.key} className="border-b pb-1.5">
                <b>{c.label}</b>{" "}
                {c.autoEvidenced
                  ? <span className="rounded px-1 text-[9px]" style={{ background: "#10b981", color: "#fff" }}>자동 증빙</span>
                  : <span className="rounded bg-neutral-200 px-1 text-[9px] text-neutral-600">자기선언</span>}
                {c.key === "monitoring" && <span className="ml-1 text-neutral-500">(평가기간 {trees.length}개 트레이스 자동 모니터링)</span>}
                <p className="text-neutral-600">{c.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="avoid-break">
          <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">Ⅴ. 평가 방법론 및 근거</h2>
          <ul className="ml-4 list-disc space-y-1 text-[11px] text-neutral-700">
            <li>위험평가(②)는 평가기간 내 {trees.length}개 트레이스의 자동 eval(품질·편향성·공정성·설명가능성·소비자보호·합법성·투명성·보안·안정성 등)을 항목별 인식·측정 위험으로 환산.</li>
            <li>동일 항목에 사람 평가(HUMAN)가 있으면 LLM 평가보다 우선 반영.</li>
            <li>잔여위험 = 인식·측정 − 경감. 부문별 합산 → 총점(0–100) → 위험등급. 고영향 AI는 최소 고위험.</li>
            <li>위탁/관리는 외부 LLM 공급자 사용 여부(플랫폼 설정)로 자동 신호화.</li>
            <li>거버넌스·교육·감독당국 보고 등 조직 항목은 플랫폼 측정 불가 — 자기선언이며 별도 검증 대상.</li>
            <li>정량 지표는 응답 수준 위험 신호이며, 법규 위반의 최종 판단은 평가자·감독당국이 수행.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
