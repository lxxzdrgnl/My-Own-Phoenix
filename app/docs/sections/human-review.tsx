"use client";

import { Callout } from "../code-block";
import { useT } from "@/lib/i18n";
import { StatCard } from "@/components/dashboard/widgets/stat-card";

/* ── Static comparison data ── */
const PAIRS = [
  { eval: "hallucination", ai: 0.2, human: 1.0, diff: true },
  { eval: "hallucination", ai: 0.9, human: 0.0, diff: true },
  { eval: "citation",      ai: 0.7, human: 0.8, diff: false },
  { eval: "qa_correctness",ai: 1.0, human: 1.0, diff: false },
  { eval: "rag_relevance", ai: 0.9, human: 0.9, diff: false },
  { eval: "guardrail",     ai: 1.0, human: 0.4, diff: true },
];

// 혼동행렬 2x2: 행=Human, 열=AI
const CM = { aiPassHumanPass: 3, aiFailHumanPass: 0, aiPassHumanFail: 1, aiFailHumanFail: 2 };

/* ── Confusion matrix (monochrome, static replica of ConfusionTab) ── */

function ConfusionMatrix({ t }: { t: ReturnType<typeof useT> }) {
  const diffTotal = CM.aiPassHumanFail + CM.aiFailHumanPass;
  const agreeTotal = CM.aiPassHumanPass + CM.aiFailHumanFail;

  // Rows = Human, Cols = AI ; [row][col]
  //   row 0 = Human Pass, row 1 = Human Fail
  //   col 0 = AI Pass,    col 1 = AI Fail
  const matrix: { value: number; isDiff: boolean }[][] = [
    [
      { value: CM.aiPassHumanPass, isDiff: false },
      { value: CM.aiFailHumanPass, isDiff: true },
    ],
    [
      { value: CM.aiPassHumanFail, isDiff: true },
      { value: CM.aiFailHumanFail, isDiff: false },
    ],
  ];

  const colHeaders = [t.docs.humanReview.pass, t.docs.humanReview.fail];
  const rowHeaders = [t.docs.humanReview.pass, t.docs.humanReview.fail];

  return (
    <div className="mx-auto" style={{ maxWidth: 460 }}>
      {/* Top: AI axis caption */}
      <div className="mb-1 ml-[88px]">
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/60">
          {t.docs.humanReview.aiAxis}
        </p>
      </div>

      <div className="grid grid-cols-[88px_1fr_1fr] gap-px">
        {/* Empty corner */}
        <div />
        {/* Column headers */}
        {colHeaders.map((h, i) => (
          <div key={`col-${i}`} className="pb-2 text-center text-xs font-medium">
            {h}
          </div>
        ))}

        {/* Body rows */}
        {matrix.map((row, rIdx) => (
          <ConfusionRow key={rIdx} rowLabel={rowHeaders[rIdx]} cells={row} />
        ))}
      </div>

      {/* Bottom: Human axis caption */}
      <div className="mt-1 ml-[88px]">
        <p className="text-right text-[10px] uppercase tracking-[0.22em] text-muted-foreground/60">
          {t.docs.humanReview.humanAxis}
        </p>
      </div>

      {/* Legend */}
      <div className="mt-5 flex items-center justify-center gap-5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full bg-foreground/40" />
          <span>{t.docs.humanReview.agree}</span>
          <span className="tabular-nums font-semibold text-foreground">{agreeTotal}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full bg-foreground" />
          <span>{t.docs.humanReview.diff}</span>
          <span className="tabular-nums font-semibold text-foreground">{diffTotal}</span>
        </span>
      </div>
    </div>
  );
}

function ConfusionRow({
  rowLabel,
  cells,
}: {
  rowLabel: string;
  cells: { value: number; isDiff: boolean }[];
}) {
  return (
    <>
      <div className="flex items-center justify-end pr-3 text-xs font-medium text-right">
        {rowLabel}
      </div>
      {cells.map((c, i) => (
        <ConfusionCell key={i} value={c.value} />
      ))}
    </>
  );
}

function ConfusionCell({ value }: { value: number }) {
  const isMuted = value === 0;
  return (
    <div className="aspect-square flex items-center justify-center rounded-md border bg-card">
      <span
        className={`text-5xl font-black tabular-nums tracking-tight ${
          isMuted ? "text-muted-foreground/30" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* ── Scatter plot (monochrome, static replica of ScatterTab) ── */

function ScatterPlot({ t }: { t: ReturnType<typeof useT> }) {
  const size = 360;
  const padL = 44;
  const padR = 20;
  const padT = 20;
  const padB = 36;
  const innerW = size - padL - padR;
  const innerH = size - padT - padB;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const diffPairs = PAIRS.filter((p) => p.diff);
  const matchPairs = PAIRS.filter((p) => !p.diff);

  function xOf(v: number) {
    return padL + innerW * Math.max(0, Math.min(1, v));
  }
  function yOf(v: number) {
    return padT + innerH - innerH * Math.max(0, Math.min(1, v));
  }

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="text-foreground"
      >
        {/* Gridlines */}
        {ticks.map((tk) => (
          <g key={`gx-${tk}`}>
            <line
              x1={xOf(tk)}
              y1={padT}
              x2={xOf(tk)}
              y2={padT + innerH}
              stroke="currentColor"
              strokeOpacity={tk === 0 ? 0.4 : 0.08}
            />
            <line
              x1={padL}
              y1={yOf(tk)}
              x2={padL + innerW}
              y2={yOf(tk)}
              stroke="currentColor"
              strokeOpacity={tk === 0 ? 0.4 : 0.08}
            />
          </g>
        ))}

        {/* Reference diagonal */}
        <line
          x1={xOf(0)}
          y1={yOf(0)}
          x2={xOf(1)}
          y2={yOf(1)}
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeDasharray="3 4"
        />

        {/* Tick labels */}
        {ticks.map((tk) => (
          <g key={`lab-${tk}`}>
            <text
              x={xOf(tk)}
              y={padT + innerH + 14}
              textAnchor="middle"
              className="fill-current"
              fillOpacity={0.5}
              fontSize="10"
              style={{ fontFamily: "'Geist Mono', monospace" }}
            >
              {tk.toFixed(2)}
            </text>
            <text
              x={padL - 8}
              y={yOf(tk) + 3}
              textAnchor="end"
              className="fill-current"
              fillOpacity={0.5}
              fontSize="10"
              style={{ fontFamily: "'Geist Mono', monospace" }}
            >
              {tk.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Match dots — empty circles (rendered first so diffs paint on top) */}
        {matchPairs.map((p, i) => (
          <circle
            key={`m-${i}`}
            cx={xOf(p.ai)}
            cy={yOf(p.human)}
            r={3}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.45}
            strokeWidth={1}
          />
        ))}

        {/* Diff dots — solid filled, larger */}
        {diffPairs.map((p, i) => (
          <circle
            key={`d-${i}`}
            cx={xOf(p.ai)}
            cy={yOf(p.human)}
            r={4.5}
            fill="currentColor"
            fillOpacity={0.92}
          />
        ))}

        {/* Axis labels */}
        <text
          x={padL + innerW / 2}
          y={size - 8}
          textAnchor="middle"
          className="fill-current"
          fillOpacity={0.65}
          fontSize="10"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          {t.docs.humanReview.scatterX}
        </text>
        <text
          x={12}
          y={padT + innerH / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${padT + innerH / 2})`}
          className="fill-current"
          fillOpacity={0.65}
          fontSize="10"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          {t.docs.humanReview.scatterY}
        </text>
      </svg>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-foreground" />
          <span>{t.docs.humanReview.diff}</span>
          <span className="tabular-nums font-semibold text-foreground">
            {diffPairs.length}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full border border-foreground/45 bg-transparent" />
          <span>{t.docs.humanReview.agree}</span>
          <span className="tabular-nums font-semibold text-foreground">
            {matchPairs.length}
          </span>
        </span>
      </div>
    </div>
  );
}

/* ── Main ── */

export function HumanReview() {
  const t = useT();
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        {t.docs.humanReview.groupLabel}
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">{t.docs.humanReview.title}</h1>
      <p className="text-sm text-muted-foreground mb-10">
        {t.docs.humanReview.subtitle}
      </p>

      <div className="space-y-10">
        {/* Why */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.humanReview.whyHeading}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t.docs.humanReview.whyDesc}
          </p>
        </div>

        {/* Where */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.humanReview.whereHeading}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {t.docs.humanReview.whereDesc}
          </p>
          <ol className="text-sm text-muted-foreground space-y-3 leading-relaxed">
            {[
              t.docs.humanReview.whereStep1,
              t.docs.humanReview.whereStep2,
              t.docs.humanReview.whereStep3,
              t.docs.humanReview.whereStep4,
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Comparison mockup */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.humanReview.exampleHeading}</h3>
          <p className="text-xs text-muted-foreground mb-3">
            {t.docs.humanReview.exampleHelper}
          </p>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="h-28 rounded-xl border bg-card">
              <StatCard value="5/8" label={t.docs.humanReview.kpiCoverage} trend="63%" />
            </div>
            <div className="h-28 rounded-xl border bg-card">
              <StatCard value="6" label={t.docs.humanReview.kpiComparable} />
            </div>
            <div className="h-28 rounded-xl border bg-card">
              <StatCard value="3" label={t.docs.humanReview.kpiDisagreement} trend="50% mismatch" />
            </div>
            <div className="h-28 rounded-xl border bg-card">
              <StatCard value="50%" label={t.docs.humanReview.kpiAgreement} />
            </div>
          </div>

          {/* Confusion matrix + scatter */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div className="rounded-xl border bg-card p-6">
              <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t.docs.humanReview.confusionTitle}
              </p>
              <ConfusionMatrix t={t} />
            </div>
            <div className="rounded-xl border bg-card p-6">
              <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t.docs.humanReview.scatterTitle}
              </p>
              <ScatterPlot t={t} />
            </div>
          </div>
        </div>

        {/* Improvement loop */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.humanReview.loopHeading}</h3>
          <ol className="text-sm text-muted-foreground space-y-3 leading-relaxed">
            {[
              t.docs.humanReview.loopStep1,
              t.docs.humanReview.loopStep2,
              t.docs.humanReview.loopStep3,
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <Callout title={t.docs.humanReview.calloutTitle}>
          {t.docs.humanReview.calloutText}
        </Callout>
      </div>
    </div>
  );
}
