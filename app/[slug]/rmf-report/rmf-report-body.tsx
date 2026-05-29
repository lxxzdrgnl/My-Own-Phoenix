"use client";
// 금융 AI RMF 보고서 본문(A4 문서) — 미리보기/인쇄 전용.

import { useT } from "@/lib/i18n";
import { computeMetrics } from "@/lib/rmf-utils";
import { RISK_SECTIONS, GOVERNANCE_ITEMS, CONTROL_ITEMS } from "@/lib/rmf/finance-rmf";
import type { AssessmentState, Finding, ScoreResult } from "@/lib/rmf/types";
import {
  GRADES, GRADE_RANGE, gradeColor, gradeText, ratioColor, ratioLabel, metricLabel,
  sectionLabel, itemText, govText, ctrlText, matrixText, checkStatusLabel,
  SourceBadge, type SectionKey,
} from "./rmf-helpers";

export interface CoverInfo {
  projectName: string;
  org: string;
  periodText: string;
  traceCount: number;
  highImpact: boolean;
  hiReason: string;
  assessor: string;
  generatedText: string;
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
  cover?: CoverInfo;
}

export function RmfBody({ score, state, metricById, findingsByItem, findingQuery, traceCount, sections, findingsCap, cover }: BodyProps) {
  const t = useT();
  const rmf = t.rmf;
  const ui = rmf.ui;
  const sectionRatio = (key: string) => {
    const sec = RISK_SECTIONS.find((s) => s.key === key)!;
    return sec.weight > 0 ? (score.sectionSubtotals[key] ?? 0) / sec.weight : 0;
  };
  const nFindings = (n: number) => ui.findingsN.replace("{n}", String(n));
  return (
    <>
      <div className="rmf-sheet">
      {cover && (
        <div className="rmf-head mb-6 border-b-2 border-neutral-800 pb-4 text-center">
          <p className="text-[11px] tracking-wide text-neutral-500">{ui.reportFramework}{cover.org ? ` · ${ui.submitTo}: ${cover.org}` : ""}</p>
          <h1 className="mt-2 text-[22px] font-extrabold">{ui.reportTitle}</h1>
          <table className="mx-auto mt-4 text-[12px]">
            <tbody>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">{ui.targetService}</td><td className="px-3 py-0.5 text-left font-semibold">{cover.projectName}</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">{ui.period}</td><td className="px-3 py-0.5 text-left">{cover.periodText}</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">{ui.tracesAnalyzed}</td><td className="px-3 py-0.5 text-left">{cover.traceCount}</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">{ui.highRiskRow}</td><td className="px-3 py-0.5 text-left">{cover.highImpact ? <span className="font-semibold" style={{ color: "#ef4444" }}>{ui.applicable}{cover.hiReason ? ` — ${cover.hiReason}` : ""}</span> : ui.notApplicable}</td></tr>
              {cover.assessor && <tr><td className="px-3 py-0.5 text-right text-neutral-500">{ui.assessorLabel}</td><td className="px-3 py-0.5 text-left">{cover.assessor}</td></tr>}
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">{ui.generatedDate}</td><td className="px-3 py-0.5 text-left">{cover.generatedText}</td></tr>
            </tbody>
          </table>
        </div>
      )}
      <section className="avoid-break mb-7">
        <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">{ui.overallGradeHeading}</h2>
        <div className="flex items-baseline gap-4">
          <div className="rmf-hero text-4xl font-extrabold" style={{ color: gradeColor(score.grade) }}>{gradeText(score.grade, rmf)}</div>
          <div className="text-[13px] text-neutral-600">{ui.residualTotalLabel} <b className="text-neutral-900">{score.total}</b> / 100</div>
        </div>
        <div className="mt-3 flex overflow-hidden rounded border text-center text-[10px]">
          {GRADES.map((g) => (
            <div key={g} className="flex-1 py-1.5" style={{ background: g === score.grade ? gradeColor(g) : "#f5f5f5", color: g === score.grade ? "#fff" : "#737373", fontWeight: g === score.grade ? 700 : 400 }}>
              {gradeText(g, rmf)} ({GRADE_RANGE[g]})
            </div>
          ))}
        </div>
      </section>

      <section className="avoid-break mb-7">
        <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">{ui.sectionRisk}</h2>
        <div className="space-y-2">
          {RISK_SECTIONS.map((sec) => {
            const ratio = sectionRatio(sec.key);
            const pct = Math.min(100, Math.round(ratio * 100));
            const color = ratioColor(ratio);
            const fcount = sec.items.reduce((a, it) => a + (findingsByItem[it.key]?.length ?? 0), 0);
            return (
              <div key={sec.key} className="flex items-center gap-3 text-[11px]">
                <div className="w-24 shrink-0 font-medium">{sectionLabel(sec.key, rmf)} <span className="text-neutral-400">({sec.weight}%)</span></div>
                <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-100"><div className="h-full" style={{ width: pct + "%", background: color }} /></div>
                <div className="w-28 shrink-0 text-right"><span className="font-semibold" style={{ color }}>{ratioLabel(ratio, rmf.levels)}</span><span className="text-neutral-500"> · {score.sectionSubtotals[sec.key] ?? 0}/{sec.weight}{fcount > 0 ? ` · ${nFindings(fcount)}` : ""}</span></div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="avoid-break mb-7">
        <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">{ui.summaryHeading}</h2>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-neutral-100 text-neutral-700">
              <th className="border px-2 py-1 text-left">{ui.thSection}</th><th className="border px-2 py-1 text-left">{ui.thItem}</th>
              <th className="border px-2 py-1">{ui.inherent}</th><th className="border px-2 py-1">{ui.mitigation}</th><th className="border px-2 py-1">{ui.residual}</th><th className="border px-2 py-1">{ui.subtotal}</th>
            </tr>
          </thead>
          <tbody>
            {RISK_SECTIONS.map((sec) => sec.items.map((item, i) => {
              const st = state.riskItems[item.key];
              const measured = !!st && st.source !== "manual";
              return (
                <tr key={item.key}>
                  {i === 0 && <td className="border px-2 py-1 align-top font-medium" rowSpan={sec.items.length}>{sectionLabel(sec.key, rmf)} ({sec.weight}%)</td>}
                  <td className="border px-2 py-1">{itemText(item.key, rmf).label}</td>
                  <td className="border px-2 py-1 text-center">{measured ? st.inherent : "-"}</td>
                  <td className="border px-2 py-1 text-center">{st?.mitigation ? "(" + st.mitigation + ")" : "-"}</td>
                  <td className="border px-2 py-1 text-center font-medium">{measured ? (score.perItemResidual[item.key] ?? 0) : "-"}</td>
                  {i === 0 && <td className="border px-2 py-1 text-center align-top font-bold" rowSpan={sec.items.length}>{score.sectionSubtotals[sec.key] ?? 0}</td>}
                </tr>
              );
            }))}
            <tr className="bg-neutral-50 font-bold"><td className="border px-2 py-1" colSpan={4}>{ui.total}</td><td className="border px-2 py-1 text-center" colSpan={2}>{score.total} / 100 → {gradeText(score.grade, rmf)}</td></tr>
          </tbody>
        </table>
        <p className="mt-1 text-[10px] text-neutral-500">{ui.summaryNote}</p>
      </section>
      </div>

      {sections.sectionDetail && (
        <div className="rmf-sheet">
        <section className="avoid-break">
          <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">{ui.detailHeading}</h2>
          {RISK_SECTIONS.map((sec) => (
            <div key={sec.key} className="mb-5">
              <h3 className="mb-2 text-[13px] font-bold text-neutral-800">{sectionLabel(sec.key, rmf)} <span className="font-normal text-neutral-500">({ui.weight} {sec.weight}% · {ui.subtotal} {score.sectionSubtotals[sec.key] ?? 0})</span></h3>
              <div className="space-y-2">
                {sec.items.map((item) => {
                  const st = state.riskItems[item.key];
                  const m = item.evalMetricId ? metricById.get(item.evalMetricId) : undefined;
                  const itemFindings = findingsByItem[item.key] ?? [];
                  return (
                    <div key={item.key} className="avoid-break rounded border border-neutral-200 p-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{itemText(item.key, rmf).label} <SourceBadge source={st?.source} /></span>
                        <span className="text-neutral-600">{st && st.source !== "manual" ? <>{ui.inherent} {st.inherent} · {ui.mitigation} {st.mitigation} · <b>{ui.residual} {score.perItemResidual[item.key] ?? 0}</b> / {item.maxInherent} · {nFindings(itemFindings.length)}</> : <span className="text-neutral-400">{ui.qualitative}</span>}</span>
                      </div>
                      <p className="mt-1 text-neutral-500">{ui.basisLabel}: {item.providerSignal ? ui.providerSignalFull + (st?.note ? ` — ${st.note}` : "") : m && !m.noData ? metricLabel(item.evalMetricId) + " " + m.value.toFixed(1) + "%" : (st?.note ? `${ui.qualitative} — ${st.note}` : ui.qualNoInput)}<span className="ml-1 text-neutral-400">· {ui.scoringGuide}: {itemText(item.key, rmf).guide}</span></p>
                      {sections.findings && itemFindings.length > 0 && (
                        <ul className="mt-1 space-y-1 border-t border-dashed pt-1">
                          {itemFindings.slice(0, findingsCap).map((f, idx) => {
                            const q = findingQuery(f);
                            return (
                              <li key={idx} className="text-neutral-700">
                                <span className="rounded bg-neutral-100 px-1 font-mono text-[9px]">{f.eval}</span>
                                {f.annotatorKind === "HUMAN" && <span className="ml-1 rounded px-1 text-[9px]" style={{ background: "#10b981", color: "#fff" }}>{ui.humanEval}</span>}
                                <span className="ml-1">: {f.reason || f.label}</span>
                                {q && <span className="block text-neutral-400">└ {ui.query}: {q.length > 80 ? q.slice(0, 80) + "…" : q}</span>}
                              </li>
                            );
                          })}
                          {itemFindings.length > findingsCap && <li className="text-neutral-400">{ui.andMore.replace("{n}", String(itemFindings.length - findingsCap))}</li>}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
        </div>
      )}

      {(sections.governance || sections.controls || sections.methodology) && (
        <div className="rmf-sheet">
      {sections.governance && (
        <section className="avoid-break mb-7">
          <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">{ui.governanceHeading}</h2>
          <ul className="space-y-1.5 text-[11px]">
            {GOVERNANCE_ITEMS.map((g) => {
              const cs = state.governance[g.key];
              const status = cs?.status ?? "done";
              const stColor = status === "done" ? "#10b981" : status === "insufficient" ? "#ef4444" : "#737373";
              return (
                <li key={g.key} className="border-b pb-1.5"><b>{govText(g.key, rmf).label}</b> <span className="rounded px-1 text-[9px] text-white" style={{ background: stColor }}>{checkStatusLabel(status, rmf.statuses)}</span><p className="text-neutral-600">{cs?.note || govText(g.key, rmf).desc}</p></li>
              );
            })}
          </ul>
        </section>
      )}

      {sections.controls && (
        <section className="avoid-break mb-7">
          <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">{ui.controlsHeading}</h2>
          <div className="mb-3 rounded border bg-neutral-50 p-2 text-[11px]">
            <b>{ui.recommendedControls} {gradeText(score.grade, rmf)} ({matrixText(score.grade, rmf).title})</b>
            <ul className="ml-4 list-disc">{matrixText(score.grade, rmf).measures.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </div>
          <ul className="space-y-1.5 text-[11px]">
            {CONTROL_ITEMS.map((c) => {
              const cs = state.controls[c.key];
              const status = cs?.status ?? "done";
              const stColor = status === "done" ? "#10b981" : status === "insufficient" ? "#ef4444" : "#737373";
              return (
                <li key={c.key} className="border-b pb-1.5">
                  <b>{ctrlText(c.key, rmf).label}</b>{" "}
                  <span className="rounded px-1 text-[9px] text-white" style={{ background: stColor }}>{checkStatusLabel(status, rmf.statuses)}</span>
                  {c.autoEvidenced && <span className="ml-1 rounded bg-neutral-200 px-1 text-[9px] text-neutral-600">{ui.autoEvidenced}</span>}
                  {c.key === "monitoring" && <span className="ml-1 text-neutral-500">{ui.monitoringNote.replace("{n}", String(traceCount))}</span>}
                  <p className="text-neutral-600">{cs?.note || ctrlText(c.key, rmf).desc}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {sections.methodology && (
        <section className="avoid-break">
          <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[15px] font-bold">{ui.methodologyHeading}</h2>
          <ul className="ml-4 list-disc space-y-1 text-[11px] text-neutral-700">
            <li>{ui.method1.replace("{n}", String(traceCount))}</li>
            <li>{ui.method2}</li>
            <li>{ui.method3}</li>
            <li>{ui.method4}</li>
            <li>{ui.method5}</li>
          </ul>
        </section>
      )}
      </div>
      )}
    </>
  );
}
