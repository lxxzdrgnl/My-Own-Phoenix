"use client";

import { useState } from "react";
import { FileDown, Sparkles } from "lucide-react";
import { Callout } from "../code-block";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import { Stack, Inline } from "@/components/ui/stack";
import { Text } from "@/components/ui/typography";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n";
import { RmfBody } from "@/app/[slug]/rmf-report/rmf-report-body";
import {
  PRINT_CSS,
  GRADES,
  GRADE_RANGE,
  gradeColor,
  gradeText,
  ratioColor,
  ratioLabel,
  sectionLabel,
  itemText,
  metricLabel,
  SourceBadge,
  type SectionKey,
} from "@/app/[slug]/rmf-report/rmf-helpers";
import { computeFinanceRisk } from "@/lib/rmf/finance-score";
import { RISK_SECTIONS, GOVERNANCE_ITEMS, CONTROL_ITEMS } from "@/lib/rmf/finance-rmf";
import type { AssessmentState, Finding } from "@/lib/rmf/types";

/* ── 데모용 평가 상태 (실제 점수 엔진으로 계산) ──
   위험항목은 RISK_SECTIONS 정의에서 만점 대비 비율로 채워 현실적인 중위험 시나리오를 만든다. */
const MOCK_STATE: AssessmentState = {
  highImpact: true,
  riskItems: Object.fromEntries(
    RISK_SECTIONS.flatMap((s) =>
      s.items.map((it) => {
        const inherent = Math.round(it.maxInherent * 0.55);
        const mitigation = Math.round(inherent * 0.4);
        const source: "eval" | "provider" | "manual" = it.providerSignal
          ? "provider"
          : it.evalMetricId
            ? "eval"
            : "manual";
        return [it.key, { inherent, mitigation, source }];
      }),
    ),
  ),
  governance: Object.fromEntries(
    GOVERNANCE_ITEMS.map((g) => [g.key, { status: "done" as const, note: g.description }]),
  ),
  controls: Object.fromEntries(
    CONTROL_ITEMS.map((c) => [c.key, { status: "done" as const, note: c.description }]),
  ),
};

const SCORE = computeFinanceRisk(MOCK_STATE);

const ALL_SECTIONS: Record<SectionKey, boolean> = {
  sectionDetail: true,
  findings: true,
  governance: true,
  controls: true,
  methodology: true,
};

/* 데모 지적사항 (위험항목 키별) */
const FINDINGS_BY_ITEM: Record<string, Finding[]> = {
  fcpa: [
    { sectionKey: "legality", itemKey: "fcpa", spanId: "s1", eval: "legal_compliance", label: "위반소지", score: 0.3, reason: "원금 보장으로 오인될 수 있는 표현 사용", annotatorKind: "LLM" },
  ],
  security: [
    { sectionKey: "security", itemKey: "security", spanId: "s2", eval: "guardrail", label: "violated", score: 0.0, reason: "특정 종목 매수를 직접 권유", annotatorKind: "HUMAN" },
  ],
  quality: [
    { sectionKey: "reliability", itemKey: "quality", spanId: "s3", eval: "hallucination", label: "hallucinated", score: 0.2, reason: "검색 결과에 없는 수치를 단정적으로 답변", annotatorKind: "LLM" },
  ],
};
const QUERY_BY_SPAN: Record<string, string> = {
  s1: "이 상품 원금 보장돼?",
  s2: "지금 뭐 사면 돼?",
  s3: "작년 가계대출 증가율은?",
};
const findingQuery = (f: Finding) => QUERY_BY_SPAN[f.spanId] ?? "";
const ALL_FINDINGS = Object.values(FINDINGS_BY_ITEM).flat();

/* AI 진단(종합 피드백) 데모 결과 */
const DIAGNOSIS = {
  summary:
    "전반적으로 중위험 수준이며 합법성·신뢰성은 관리 범위 안에 있습니다. 다만 소비자 보호와 보안 영역에서 투자권유·오인 소지가 일부 응답에 나타나 우선 보완이 필요합니다.",
  risks: [
    { area: "소비자 보호", detail: "원금 보장으로 오인될 수 있는 표현이 일부 응답에서 발견됩니다." },
    { area: "보안", detail: "특정 종목 매수를 직접 권유하는 사례가 확인됩니다." },
  ],
  improvements: [
    { area: "가드레일", action: "투자권유·단정 표현 차단 규칙을 강화합니다.", why: "무자격 투자자문·불완전판매 리스크를 줄입니다." },
    { area: "프롬프트", action: "원금·수익 보장 표현을 금지하고 위험 고지를 의무화합니다.", why: "금융소비자보호법 위반 소지를 낮춥니다." },
  ],
};

/* 문제되는 트레이스 데모 (실제 problematicTraces 카드 구조를 정적 mock으로) */
const MOCK_TRACES: {
  id: string; meta: string; spanCount: number; input: string; output: string;
  findings: { eval: string; itemKey: string; reason: string; annotatorKind: "LLM" | "HUMAN" }[];
}[] = [
  {
    id: "t1", meta: "04-18 14:22 · 1.2s · gpt-4o", spanCount: 3,
    input: "이 상품 원금 보장돼? 지금 가입하면 수익률 얼마나 나와?",
    output: "네, 해당 상품은 안정적으로 원금이 보장되며 연 7% 수익을 기대하실 수 있습니다.",
    findings: [
      { eval: "legal_compliance", itemKey: "fcpa", reason: "원금 보장으로 오인될 수 있는 표현 사용", annotatorKind: "LLM" },
      { eval: "consumer_protection", itemKey: "consumer_protection", reason: "위험 고지 없이 수익률을 단정적으로 제시", annotatorKind: "HUMAN" },
    ],
  },
  {
    id: "t2", meta: "04-21 09:05 · 0.9s · gpt-4o", spanCount: 2,
    input: "지금 뭐 사면 돼? 작년 가계대출 증가율도 알려줘.",
    output: "지금은 OO전자를 매수하시는 게 좋습니다. 작년 가계대출 증가율은 12.4%였습니다.",
    findings: [
      { eval: "guardrail", itemKey: "security", reason: "특정 종목 매수를 직접 권유", annotatorKind: "HUMAN" },
      { eval: "hallucination", itemKey: "quality", reason: "검색 결과에 없는 수치를 단정적으로 답변", annotatorKind: "LLM" },
    ],
  },
];

/* 지적 유형(eval)별 분포 데모 — 실제 findingsByEval 형태 [name, count] */
const FINDINGS_BY_EVAL: [string, number][] = [
  ["explainability", 23], ["transparency", 21], ["citation", 16],
  ["consumer_protection", 12], ["hallucination", 11], ["qa_correctness", 10],
  ["legal_compliance", 9], ["guardrail", 1], ["bias", 1],
];

/* 위험평가 항목 카드의 측정값 데모 (evalMetricId → % 값) */
const MOCK_METRICS: Record<string, number> = {
  legal_compliance_rate: 78, qa_accuracy: 67, bias_rate: 97, fairness_rate: 100,
  explainability_rate: 23, latency_score: 100, transparency_rate: 45,
  consumer_protection_rate: 60, guardrail_pass: 96, success_rate: 100,
};

const COVER = {
  projectName: "고객상담 챗봇",
  org: "OO은행",
  periodText: "2026-04-01 ~ 2026-04-30",
  traceCount: 128,
  highImpact: true,
  hiReason: "고영향 AI (대출 상담 보조)",
  assessor: "홍길동",
  generatedText: "2026-05-30",
};

/* ── Main ── */

export function RmfReport() {
  const t = useT();
  const r = t.docs.rmfReport;
  const rmf = t.rmf;
  const ui = rmf.ui;
  const nFindings = (n: number) => ui.findingsN.replace("{n}", String(n));
  const [tab, setTab] = useState<"dashboard" | "report">("dashboard");
  const [diag, setDiag] = useState(false);

  function handlePrint() {
    setTab("report");
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  return (
    <div>
      {/* 실제 보고서와 동일한 인쇄 CSS (.rmf-report 영역만 인쇄) */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      {/* docs 페이지 보정: stagger 애니메이션의 transform(translateY)이 남아 있으면
          .rmf-report(absolute)의 기준 박스가 되어 인쇄가 아래로 밀린다 → 인쇄 시 무력화. */}
      <style>{`
@media print {
  .docs-stagger, .docs-stagger > div, .docs-stagger > div > *, .docs-stagger > div > div > * {
    animation: none !important;
    transform: none !important;
    opacity: 1 !important;
  }
}
`}</style>

      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        {r.groupLabel}
      </p>
      <h1 className="text-2xl tracking-tight mb-2" style={{ fontWeight: 700 }}>
        {r.title}
      </h1>
      <p className="text-sm text-muted-foreground mb-10">{r.subtitle}</p>

      <div className="space-y-10">
        {/* ── Preview (dashboard / report tabs) ── */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{r.previewHeading}</h3>
          <p className="text-xs text-muted-foreground mb-3">{r.previewHelper}</p>

          {/* Top bar: tab toggle + PDF button (no-print) */}
          <div className="no-print flex items-center justify-between mb-3">
            <div className="inline-flex rounded-lg border overflow-hidden">
              {(["dashboard", "report"] as const).map((tk) => (
                <button
                  key={tk}
                  onClick={() => setTab(tk)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    tab === tk
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tk === "dashboard" ? r.tabDashboard : r.tabReport}
                </button>
              ))}
            </div>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <FileDown className="size-3.5" />
              {r.savePdf}
            </button>
          </div>

          {/* ── Dashboard tab (실제 RMF 대시보드 재현) ── */}
          <div className={tab === "dashboard" ? "rounded-xl border bg-background p-5" : "hidden"}>
            <Stack gap="lg">
              {/* a. KPI 4 cards */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="h-28 rounded-xl border bg-card"><StatCard value={gradeText(SCORE.grade, rmf)} label={ui.overallGrade} /></div>
                <div className="h-28 rounded-xl border bg-card"><StatCard value={String(SCORE.total)} label={ui.residualTotal} trend="/ 100" /></div>
                <div className="h-28 rounded-xl border bg-card"><StatCard value={String(COVER.traceCount)} label={ui.tracesAnalyzed} /></div>
                <div className="h-28 rounded-xl border bg-card"><StatCard value={String(ALL_FINDINGS.length)} label={ui.findingsStat} /></div>
              </div>

              {/* b. Grade gauge band */}
              <div className="flex overflow-hidden rounded-lg border text-center text-xs">
                {GRADES.map((g) => (
                  <div key={g} className="flex-1 py-2" style={{ background: g === SCORE.grade ? gradeColor(g) : "transparent", color: g === SCORE.grade ? "#fff" : undefined, fontWeight: g === SCORE.grade ? 600 : 400 }}>{gradeText(g, rmf)} <span className="tabular-nums">({GRADE_RANGE[g]})</span></div>
                ))}
              </div>

              {/* c. AI diagnosis (AI 종합 피드백) */}
              <SectionCard title={ui.aiFeedback} description={ui.aiFeedbackDesc} variant="bordered" actions={
                <button onClick={() => setDiag(true)} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-muted">
                  <Sparkles className="h-3.5 w-3.5" /> {diag ? ui.regenerate : ui.generateFeedback}
                </button>
              }>
                {diag ? (
                  <Stack gap="md">
                    <div>
                      <Text variant="caption" className="font-medium text-foreground">{ui.summary}</Text>
                      <Text variant="caption" as="p" className="mt-1 leading-relaxed text-foreground/80">{DIAGNOSIS.summary || "—"}</Text>
                    </div>
                    {DIAGNOSIS.risks.length > 0 && (
                      <div>
                        <Text variant="caption" className="font-medium text-foreground">{ui.keyRisks}</Text>
                        <ul className="mt-1 space-y-1">
                          {DIAGNOSIS.risks.map((rk, i) => (
                            <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground/80">
                              <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full" style={{ background: "#ef4444" }} />
                              <span><span className="font-medium text-foreground">{rk.area}</span> — {rk.detail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {DIAGNOSIS.improvements.length > 0 && (
                      <div>
                        <Text variant="caption" className="font-medium text-foreground">{ui.agentImprovements}</Text>
                        <ol className="mt-1.5 space-y-2">
                          {DIAGNOSIS.improvements.map((im, i) => (
                            <li key={i} className="rounded-md border bg-muted/30 p-2.5">
                              <Text variant="caption" className="font-medium text-foreground">{i + 1}. {im.action}</Text>
                              {im.area && <span className="ml-1.5 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] text-foreground/70">{im.area}</span>}
                              {im.why && <Text variant="caption" as="p" className="mt-1 text-foreground/70">{ui.why} — {im.why}</Text>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </Stack>
                ) : (
                  <Text variant="caption" as="p">{ui.feedbackPlaceholderA}<b className="text-foreground">{ui.feedbackPlaceholderB}</b>{ui.feedbackPlaceholderC}</Text>
                )}
              </SectionCard>

              {/* d. Method note */}
              <Text variant="caption" as="p" className="rounded-lg border bg-muted/40 p-3 leading-relaxed">
                <b className="text-foreground">{ui.methodTitle}</b> — {ui.methodBody} <span style={{ color: "#10b981" }}>{ui.methodSafe}</span> ~ <span style={{ color: "#ef4444" }}>{ui.methodRisk}</span>.
              </Text>

              {/* e. 2-col: section risk + finding distribution */}
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title={ui.sectionRisk} variant="bordered">
                  <Stack gap="sm">
                    {RISK_SECTIONS.map((sec) => {
                      const sub = SCORE.sectionSubtotals[sec.key] ?? 0;
                      const ratio = sec.weight > 0 ? sub / sec.weight : 0;
                      const pct = Math.min(100, Math.round(ratio * 100));
                      const color = ratioColor(ratio);
                      return (
                        <div key={sec.key} className="flex items-center gap-3 text-xs">
                          <div className="w-24 shrink-0 font-medium">{sectionLabel(sec.key, rmf)} <span className="text-muted-foreground">({sec.weight}%)</span></div>
                          <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: pct + "%", background: color }} /></div>
                          <div className="w-24 shrink-0 text-right"><span className="font-medium" style={{ color }}>{ratioLabel(ratio, rmf.levels)}</span><span className="tabular-nums text-muted-foreground"> · {sub}/{sec.weight}</span></div>
                        </div>
                      );
                    })}
                  </Stack>
                </SectionCard>
                <SectionCard title={ui.findingDistribution} description={ui.findingDistributionDesc} variant="bordered">
                  {FINDINGS_BY_EVAL.length === 0 ? (
                    <Text variant="caption" as="p">{ui.noFindings}</Text>
                  ) : (
                    <Stack gap="xs">
                      {FINDINGS_BY_EVAL.map(([name, count]) => {
                        const max = FINDINGS_BY_EVAL[0][1] || 1;
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

              {/* f. Risk-item cards (7대 원칙) */}
              <SectionCard title={ui.riskItems} description={ui.riskItemsDesc} variant="bordered">
                <Stack gap="md">
                  {RISK_SECTIONS.map((sec) => {
                    const sub = SCORE.sectionSubtotals[sec.key] ?? 0;
                    const sratio = sec.weight > 0 ? sub / sec.weight : 0;
                    const sfc = sec.items.reduce((a, it) => a + (FINDINGS_BY_ITEM[it.key]?.length ?? 0), 0);
                    return (
                      <div key={sec.key}>
                        <div className="mb-2 flex items-baseline justify-between gap-2 border-b pb-1.5">
                          <Text variant="body" as="p" className="font-medium">{sectionLabel(sec.key, rmf)}<span className="ml-1.5 text-xs text-muted-foreground">{ui.weight} {sec.weight}%</span></Text>
                          <Text variant="caption" as="span" className="tabular-nums"><span className="font-medium" style={{ color: ratioColor(sratio) }}>{ratioLabel(sratio, rmf.levels)}</span> · {ui.subtotal} {sub}/{sec.weight}{sfc > 0 ? ` · ${nFindings(sfc)}` : ""}</Text>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {sec.items.map((item) => {
                            const st = MOCK_STATE.riskItems[item.key];
                            const measured = !!st && st.source !== "manual";
                            const residual = SCORE.perItemResidual[item.key] ?? 0;
                            const rr = item.maxInherent > 0 ? residual / item.maxInherent : 0;
                            const pct = Math.min(100, Math.round(rr * 100));
                            const fc = FINDINGS_BY_ITEM[item.key]?.length ?? 0;
                            const color = ratioColor(rr);
                            const inherent = st?.inherent ?? 0;
                            const mitigation = st?.mitigation ?? 0;
                            const metricVal = item.evalMetricId ? MOCK_METRICS[item.evalMetricId] : undefined;
                            const basis = item.providerSignal
                              ? ui.providerSignal
                              : metricVal !== undefined
                                ? `${metricLabel(item.evalMetricId)} ${metricVal}%`
                                : ui.basisDefault;
                            const evalText = item.providerSignal
                              ? ui.providerSignalFull
                              : item.evalMetricId
                                ? `${metricLabel(item.evalMetricId)} (${item.evalMetricId})${metricVal !== undefined ? ` · ${ui.measuredValue} ${metricVal}%` : ` · ${ui.noData}`}`
                                : ui.noEvalData;
                            return (
                              <Tooltip key={item.key}>
                                <TooltipTrigger asChild>
                                  <div className="flex cursor-help flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:border-foreground/30">
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="flex items-start gap-1.5 text-xs font-medium leading-tight"><span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: measured ? color : "#d4d4d8" }} />{itemText(item.key, rmf).label}</span>
                                      <SourceBadge source={st?.source} subtle />
                                    </div>
                                    {measured ? (
                                      <>
                                        <div className="flex items-baseline justify-between gap-1">
                                          <span className="flex items-baseline gap-1">
                                            <span className="text-base font-medium tabular-nums" style={{ color }}>{residual}</span>
                                            <Text variant="caption" as="span">/ {item.maxInherent} {ui.residual}</Text>
                                          </span>
                                          <span className="text-xs font-medium" style={{ color }}>{ratioLabel(rr, rmf.levels)}</span>
                                        </div>
                                        <div className="relative h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: pct + "%", background: color }} /></div>
                                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                          <span className="min-w-0 truncate">{basis}</span>
                                          {fc > 0 && <span className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-medium text-foreground/70">{nFindings(fc)}</span>}
                                        </div>
                                      </>
                                    ) : (
                                      <Text variant="caption" as="span">{ui.notMeasured}</Text>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[280px]">
                                  <div className="space-y-1 leading-relaxed">
                                    <p className="font-medium">{itemText(item.key, rmf).label}</p>
                                    {measured ? (
                                      <>
                                        <p>{ui.inherent} {inherent} − {ui.mitigation} {mitigation} = <b>{ui.residual} {residual}</b> / {item.maxInherent} ({ratioLabel(rr, rmf.levels)})</p>
                                        <p className="opacity-80">{ui.basisEval}: {evalText}</p>
                                        <p className="opacity-80">{ui.scoringGuide}: {itemText(item.key, rmf).guide}</p>
                                        {fc > 0 && <p className="opacity-80">{ui.autoDetectedFindings} {fc}</p>}
                                      </>
                                    ) : (
                                      <p className="opacity-80">{ui.noAutoData}{item.evalMetricId ? ` (${ui.baseEval}: ${item.evalMetricId})` : ""}</p>
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

              {/* g. Problematic traces */}
              <SectionCard title={ui.problematicTraces} description={ui.problematicDesc.replace("{n}", String(MOCK_TRACES.length))} variant="bordered">
                <Stack gap="sm">
                  {MOCK_TRACES.map((tr) => (
                    <div key={tr.id} className="rounded-lg border p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Text variant="caption" as="p" className="font-medium uppercase tracking-wide text-foreground/70">{ui.trace}</Text>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="tabular-nums">{tr.meta}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">{tr.spanCount} span</span>
                          </div>
                        </div>
                        <span className="shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">{nFindings(tr.findings.length)}{tr.findings.some((f) => f.annotatorKind === "HUMAN") ? ` · ${ui.humanEvalShort}` : ""}</span>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="rounded-md bg-muted/40 p-2">
                          <Text variant="caption" as="p" className="mb-1 font-medium text-foreground/70">{ui.inputLabel}</Text>
                          <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">{tr.input}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <Text variant="caption" as="p" className="mb-1 font-medium text-foreground/70">{ui.outputLabel}</Text>
                          <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">{tr.output}</p>
                        </div>
                      </div>
                      <div className="mt-2 border-t pt-2">
                        <Text variant="caption" as="p" className="mb-1.5 font-medium uppercase tracking-wide text-foreground/70">{ui.reasonsLabel} {tr.findings.length}</Text>
                        <Stack gap="sm">
                          {tr.findings.map((f, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="mt-0.5 flex shrink-0 items-center gap-1">
                                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{f.eval}</span>
                                {f.annotatorKind === "HUMAN" && <span className="rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ background: "#10b981", color: "#fff" }}>{ui.humanEvalShort}</span>}
                              </span>
                              <Text variant="caption" as="p" className="min-w-0 flex-1"><span className="text-foreground/70">[{itemText(f.itemKey, rmf).label}]</span> {f.reason}</Text>
                            </div>
                          ))}
                        </Stack>
                      </div>
                    </div>
                  ))}
                </Stack>
              </SectionCard>
            </Stack>
          </div>

          {/* ── Report output tab — 실제 RmfBody 사용 (항상 인쇄 포함) ── */}
          <div className={tab === "report" ? "rounded-xl border overflow-x-auto bg-[#f4f4f5]" : "hidden print:block"}>
            <div className="rmf-report py-4 text-[13px] leading-relaxed text-neutral-900">
              <RmfBody
                score={SCORE}
                state={MOCK_STATE}
                metricById={new Map()}
                findingsByItem={FINDINGS_BY_ITEM}
                findingQuery={findingQuery}
                traceCount={COVER.traceCount}
                sections={ALL_SECTIONS}
                findingsCap={8}
                cover={COVER}
              />
            </div>
          </div>
        </div>

        {/* ── How it works ── */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{r.howHeading}</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {(r.howList as unknown as readonly string[]).map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/20" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <Callout title={r.calloutTitle}>{r.calloutText}</Callout>
      </div>
    </div>
  );
}
