"use client";

import { useState } from "react";
import { FileDown, Sparkles } from "lucide-react";
import { Callout } from "../code-block";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { useT } from "@/lib/i18n";
import { RmfBody } from "@/app/[slug]/rmf-report/rmf-report-body";
import {
  PRINT_CSS,
  GRADES,
  GRADE_RANGE,
  gradeText,
  sectionLabel,
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

          {/* ── Dashboard tab ── */}
          <div className={tab === "dashboard" ? "rounded-xl border bg-background p-5 space-y-6" : "hidden"}>
            {/* Grade gauge */}
            <div className="flex overflow-hidden rounded-lg border">
              {GRADES.map((g) => {
                const active = g === SCORE.grade;
                return (
                  <div
                    key={g}
                    className={`flex-1 py-2 text-center text-[10px] ${
                      active ? "bg-foreground text-background font-bold" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {gradeText(g, rmf)} ({GRADE_RANGE[g]})
                  </div>
                );
              })}
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="h-28 rounded-xl border bg-card">
                <StatCard value={gradeText(SCORE.grade, rmf)} label={r.gradeLabel} />
              </div>
              <div className="h-28 rounded-xl border bg-card">
                <StatCard value={SCORE.total} label={r.totalLabel} trend="/ 100" />
              </div>
              <div className="h-28 rounded-xl border bg-card">
                <StatCard value={COVER.traceCount} label={r.tracesLabel} />
              </div>
              <div className="h-28 rounded-xl border bg-card">
                <StatCard value={ALL_FINDINGS.length} label={r.findingsLabel} />
              </div>
            </div>

            {/* Section risk bars */}
            <div>
              <h4 className="text-xs font-semibold mb-3">{r.sectionRiskHeading}</h4>
              <div className="space-y-2">
                {RISK_SECTIONS.map((sec) => {
                  const subtotal = SCORE.sectionSubtotals[sec.key] ?? 0;
                  const pct = sec.weight > 0 ? Math.min(100, Math.round((subtotal / sec.weight) * 100)) : 0;
                  return (
                    <div key={sec.key} className="flex items-center gap-3 text-xs">
                      <div className="w-32 shrink-0 text-muted-foreground">
                        {sectionLabel(sec.key, rmf)}{" "}
                        <span className="text-muted-foreground/60">({sec.weight}%)</span>
                      </div>
                      <div className="relative h-4 flex-1 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                        {subtotal}/{sec.weight}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Problem traces */}
            <div>
              <h4 className="text-xs font-semibold mb-3">{r.problemHeading}</h4>
              <div className="space-y-2">
                {ALL_FINDINGS.map((f, i) => (
                  <div key={i} className="rounded-lg border p-3 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                        {f.eval}
                      </span>
                      {f.annotatorKind === "HUMAN" && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[9px] font-medium"
                          style={{ background: "#10b981", color: "#fff" }}
                        >
                          {r.humanBadge}
                        </span>
                      )}
                      <span className="text-foreground">{f.reason}</span>
                    </div>
                    <p className="text-muted-foreground">└ {findingQuery(f)}</p>
                  </div>
                ))}
              </div>
            </div>
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

        {/* ── AI diagnosis ── */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{r.diagHeading}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{r.diagDesc}</p>

          {!diag ? (
            <button
              onClick={() => setDiag(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
            >
              <Sparkles className="size-3.5" />
              {r.diagButton}
            </button>
          ) : (
            <div className="rounded-xl border bg-card p-5 space-y-5">
              {/* 종합 평가 */}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {r.diagSummaryLabel}
                </p>
                <p className="text-sm leading-relaxed">{DIAGNOSIS.summary}</p>
              </div>
              {/* 주요 위험 */}
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {r.diagRisksLabel}
                </p>
                <ul className="space-y-2">
                  {DIAGNOSIS.risks.map((rk, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#ef4444" }} />
                      <span>
                        <span className="font-medium">{rk.area}</span>
                        <span className="text-muted-foreground"> — {rk.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* 우선 개선 권고 */}
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {r.diagImprovementsLabel}
                </p>
                <ul className="space-y-2.5">
                  {DIAGNOSIS.improvements.map((im, i) => (
                    <li key={i} className="rounded-lg border p-3 text-sm">
                      <p className="font-medium">
                        {im.area} <span className="font-normal text-muted-foreground">— {im.action}</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">└ {im.why}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
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
