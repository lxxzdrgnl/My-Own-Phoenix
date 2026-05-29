"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { logger } from "@/lib/logger";
import { fetchSpansAndAnnotations, buildTraceTrees, type RawSpan, type Annotation } from "@/lib/phoenix";
import { computeMetrics } from "@/lib/rmf-utils";
import type { SpanData, AnnotationData } from "@/lib/dashboard-utils";
import {
  RISK_SECTIONS, GOVERNANCE_ITEMS, CONTROL_ITEMS, CONTROL_MATRIX,
} from "@/lib/rmf/finance-rmf";
import { prefillRiskItems, extractFindings } from "@/lib/rmf/finance-prefill";
import { computeFinanceRisk } from "@/lib/rmf/finance-score";
import type { AssessmentState, Finding, Grade } from "@/lib/rmf/types";

const GRADES: Grade[] = ["저", "중", "고", "초고"];
function gradeColor(g: Grade): string {
  if (g === "초고" || g === "고") return "#ef4444";
  if (g === "저") return "#10b981";
  return "#737373";
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
@page { size: A4; margin: 14mm; }
@media print {
  .no-print { display: none !important; }
  .rmf-report { box-shadow: none !important; margin: 0 !important; width: auto !important; }
  .page-break { break-before: page; }
  table { break-inside: avoid; }
}
`;

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

  const state: AssessmentState = useMemo(() => ({
    highImpact: false,
    riskItems: prefillRiskItems(metrics, hasProvider),
    governance: {}, controls: {},
  }), [metrics, hasProvider]);

  const score = useMemo(() => computeFinanceRisk(state), [state]);
  const findings = useMemo(() => extractFindings(annMap), [annMap]);
  const findingsBySection = useMemo(() => {
    const m: Record<string, Finding[]> = {};
    for (const f of findings) (m[f.sectionKey] ??= []).push(f);
    return m;
  }, [findings]);

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

  if (loading) return <div className="p-12 text-center text-sm text-muted-foreground">보고서 생성 중…</div>;

  return (
    <div className="mx-auto max-w-[820px] p-6">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print mb-4 flex justify-end">
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/80">
          <Printer className="h-3.5 w-3.5" /> 인쇄 / PDF 저장
        </button>
      </div>

      <div className="rmf-report rounded-lg border bg-white p-10 text-[13px] leading-relaxed text-neutral-900 shadow-sm">
        {/* 머리말 */}
        <div className="mb-6 border-b pb-4 text-center">
          <p className="text-[11px] text-neutral-500">금융분야 AI 위험관리 프레임워크(AI RMF)</p>
          <h1 className="mt-1 text-xl font-bold">AI 위험평가 보고서</h1>
          <p className="mt-2 text-[12px] text-neutral-600">
            서비스: <b>{phoenixProject}</b> · 평가기간: {fmtDate(periodFrom)} ~ {fmtDate(periodTo)} · 생성일: {fmtDate(periodTo)}
          </p>
        </div>

        {/* 위험등급 게이지 */}
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold">종합 위험등급</h2>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-extrabold" style={{ color: gradeColor(score.grade) }}>{score.grade}위험</div>
            <div className="text-[12px] text-neutral-600">총점 <b>{score.total}</b> / 100</div>
          </div>
          <div className="mt-2 flex overflow-hidden rounded border text-center text-[10px]">
            {GRADES.map((g) => (
              <div key={g} className="flex-1 py-1" style={{ background: g === score.grade ? gradeColor(g) : "#f5f5f5", color: g === score.grade ? "#fff" : "#737373", fontWeight: g === score.grade ? 700 : 400 }}>
                {g}위험 {g === "저" ? "(<25)" : g === "중" ? "(25–50)" : g === "고" ? "(50–75)" : "(75+)"}
              </div>
            ))}
          </div>
        </section>

        {/* 위험평가 결과표 */}
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold">Ⅰ. 위험평가 결과 (7대 원칙)</h2>
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
              {RISK_SECTIONS.map((sec) => sec.items.map((item, i) => {
                const st = state.riskItems[item.key];
                const residual = score.perItemResidual[item.key] ?? 0;
                return (
                  <tr key={item.key}>
                    {i === 0 && (
                      <td className="border px-2 py-1 align-top font-medium" rowSpan={sec.items.length}>
                        {sec.label} ({sec.weight}%)
                      </td>
                    )}
                    <td className="border px-2 py-1">{item.label}</td>
                    <td className="border px-2 py-1 text-center">{st?.inherent ?? 0}</td>
                    <td className="border px-2 py-1 text-center">{st?.mitigation ? `(${st.mitigation})` : "-"}</td>
                    <td className="border px-2 py-1 text-center font-medium">{residual}</td>
                    {i === 0 && (
                      <td className="border px-2 py-1 text-center align-top font-medium" rowSpan={sec.items.length}>
                        {score.sectionSubtotals[sec.key] ?? 0}
                      </td>
                    )}
                  </tr>
                );
              }))}
              <tr className="bg-neutral-50 font-bold">
                <td className="border px-2 py-1" colSpan={4}>총점</td>
                <td className="border px-2 py-1 text-center" colSpan={2}>{score.total} / 100 → {score.grade}위험</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-neutral-500">※ 인식·측정 점수는 평가기간 eval 모니터링 결과로 자동 산출(사람 평가 우선), 잔여위험 = 인식·측정 − 경감.</p>
        </section>

        {/* 지적 사항 */}
        <section className="mb-6 page-break">
          <h2 className="mb-2 text-sm font-bold">Ⅱ. 주요 지적 사항</h2>
          {findings.length === 0 ? (
            <p className="text-[12px] text-neutral-500">평가기간 내 자동 탐지된 지적 사항이 없습니다.</p>
          ) : (
            RISK_SECTIONS.filter((s) => findingsBySection[s.key]?.length).map((sec) => (
              <div key={sec.key} className="mb-3">
                <p className="mb-1 text-[12px] font-semibold">{sec.label} <span className="text-neutral-500">({findingsBySection[sec.key].length}건)</span></p>
                <ul className="space-y-1">
                  {findingsBySection[sec.key].slice(0, 12).map((f, idx) => (
                    <li key={idx} className="text-[11px] text-neutral-700">
                      <span className="rounded bg-neutral-100 px-1 font-mono text-[9px]">{f.eval}</span>
                      {f.annotatorKind === "HUMAN" && <span className="ml-1 rounded px-1 text-[9px]" style={{ background: "#10b981", color: "#fff" }}>사람평가</span>}
                      <span className="ml-1">{f.reason || f.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>

        {/* 거버넌스 */}
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold">Ⅲ. 거버넌스 체계 현황</h2>
          <ul className="space-y-1 text-[11px]">
            {GOVERNANCE_ITEMS.map((g) => (
              <li key={g.key} className="border-b pb-1">
                <b>{g.label}</b> — <span className="text-neutral-600">{g.description}</span>
                <span className="ml-1 text-neutral-400">[자기선언 확인 필요]</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 위험통제 */}
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold">Ⅳ. 위험통제 현황</h2>
          <div className="mb-2 rounded border bg-neutral-50 p-2 text-[11px]">
            <b>등급별 권고 통제 — {score.grade}위험 ({CONTROL_MATRIX[score.grade].title})</b>
            <ul className="ml-4 list-disc">
              {CONTROL_MATRIX[score.grade].measures.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
          <ul className="space-y-1 text-[11px]">
            {CONTROL_ITEMS.map((c) => (
              <li key={c.key} className="border-b pb-1">
                <b>{c.label}</b> — <span className="text-neutral-600">{c.description}</span>
                {c.autoEvidenced
                  ? <span className="ml-1 rounded px-1 text-[9px]" style={{ background: "#10b981", color: "#fff" }}>자동 증빙</span>
                  : <span className="ml-1 text-neutral-400">[자기선언]</span>}
                {c.key === "monitoring" && <span className="ml-1 text-neutral-500">(평가기간 {trees.length}개 트레이스 모니터링)</span>}
              </li>
            ))}
          </ul>
        </section>

        {/* eval 근거 */}
        <section>
          <h2 className="mb-2 text-sm font-bold">Ⅴ. 평가 근거 (eval)</h2>
          <p className="text-[11px] text-neutral-600">
            본 평가는 평가기간 내 {trees.length}개 트레이스에 대한 자동 eval(품질·편향성·공정성·설명가능성·소비자보호·합법성·투명성·보안·안정성 등) 집계를 인식·측정 위험으로 환산하고,
            사람 평가가 있는 경우 이를 우선 반영하여 산출되었습니다. 거버넌스·교육·감독당국 보고 등 조직 항목은 자기선언입니다.
          </p>
        </section>
      </div>
    </div>
  );
}
