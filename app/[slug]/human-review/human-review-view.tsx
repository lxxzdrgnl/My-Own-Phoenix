"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Eye } from "lucide-react";
import { useT } from "@/lib/i18n";
import { fetchTraces, fetchTraceTrees, type Trace, type TraceTree } from "@/lib/phoenix";
import { useProjectSse } from "@/lib/hooks/use-project-sse";
import {
  AiHumanComparison,
  pairsFromTraces,
} from "@/components/dashboard/widgets/ai-human-comparison";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { LoadingState } from "@/components/ui/empty-state";
import { Heading, Text } from "@/components/ui/typography";
import { Stack, Inline } from "@/components/ui/stack";
import { SectionCard } from "@/components/ui/section-card";
import { logger } from "@/lib/logger";

const SAMPLE_TRACES: Trace[] = [
  {
    spanId: "sample-1",
    traceId: "trace-aaaa-0001",
    time: "",
    latency: 0,
    query: "What is the capital of France?",
    context: "",
    response: "Paris.",
    annotations: [
      { name: "hallucination", label: "fail", score: 0.2, annotatorKind: "LLM" },
      { name: "hallucination", label: "pass", score: 1.0, annotatorKind: "HUMAN" },
    ],
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    model: "",
    status: "",
    spanKind: "",
  },
  {
    spanId: "sample-2",
    traceId: "trace-aaaa-0002",
    time: "",
    latency: 0,
    query: "How tall is Everest?",
    context: "",
    response: "8,848m.",
    annotations: [
      { name: "hallucination", label: "pass", score: 0.9, annotatorKind: "LLM" },
      { name: "hallucination", label: "fail", score: 0.0, annotatorKind: "HUMAN" },
    ],
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    model: "",
    status: "",
    spanKind: "",
  },
];

interface Props {
  phoenixProject: string;
  projectId: string;
  slug: string;
}

export function HumanReviewView({ phoenixProject, projectId, slug }: Props) {
  const t = useT();
  const [traces, setTraces] = useState<Trace[]>([]);
  const [traceTrees, setTraceTrees] = useState<TraceTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSample, setShowSample] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ts, trees] = await Promise.all([
        fetchTraces(phoenixProject),
        fetchTraceTrees(phoenixProject),
      ]);
      ts.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setTraces(ts);
      setTraceTrees(trees);
    } catch (e) {
      logger.error("human review load failed", e);
    }
    setLoading(false);
  }, [phoenixProject]);

  useEffect(() => {
    load();
  }, [load]);

  useProjectSse(projectId, (msg) => {
    if (msg.type === "eval-completed") load();
  });

  const hasHuman = traces.some((tr) => tr.annotations.some((a) => a.annotatorKind === "HUMAN"));

  // Stats source: real traces or sample data when in sample mode
  const statSource = showSample && !hasHuman ? SAMPLE_TRACES : traces;
  const stats = useMemo(() => computeStats(statSource), [statSource]);

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <Inline gap="sm" className="mb-5 justify-between flex-wrap" align="start">
          <Stack gap="xs">
            <Heading level="page" as="h1" className="text-xl">
              {t.humanReview.title}
            </Heading>
            <Text variant="caption" as="p">
              {t.humanReview.pageDescription}
            </Text>
          </Stack>
          {showSample && !hasHuman && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-dashed border-border bg-muted/40 px-2.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              {t.humanReview.sampleBadge}
            </span>
          )}
        </Inline>

        {loading ? (
          <LoadingState />
        ) : (
          <Stack gap="lg">
            {/* Stat cards (always shown) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border bg-card h-28">
                <StatCard
                  value={
                    stats.total > 0
                      ? `${stats.tracesWithHuman}/${stats.total}`
                      : "0/0"
                  }
                  label={t.humanReview.kpiCoverage}
                  trend={`${stats.coveragePct}%`}
                />
              </div>
              <div className="rounded-xl border bg-card h-28">
                <StatCard
                  value={stats.comparable > 0 ? String(stats.comparable) : "—"}
                  label={t.humanReview.kpiComparable}
                  trend={
                    stats.evalNames.length > 0
                      ? `${stats.evalNames.length} eval`
                      : t.humanReview.kpiNeedsHuman
                  }
                />
              </div>
              <div className="rounded-xl border bg-card h-28">
                <StatCard
                  value={stats.comparable > 0 ? String(stats.diffCount) : "—"}
                  label={t.humanReview.kpiDisagreement}
                  trend={stats.comparable > 0 ? `${stats.diffPct}% mismatch` : "—"}
                />
              </div>
              <div className="rounded-xl border bg-card h-28">
                <StatCard
                  value={stats.comparable > 0 ? `${stats.agreePct}%` : "—"}
                  label={t.humanReview.kpiAgreement}
                  trend={
                    stats.comparable > 0
                      ? `${stats.comparable - stats.diffCount}/${stats.comparable}`
                      : "—"
                  }
                />
              </div>
            </div>

            {/* Main */}
            {hasHuman ? (
              <AiHumanComparison
                traces={traces}
                traceTrees={traceTrees}
                projectId={projectId}
                projectName={phoenixProject}
                slug={slug}
                onRefresh={load}
              />
            ) : showSample ? (
              <Stack gap="sm">
                <div className="opacity-70">
                  <AiHumanComparison traces={SAMPLE_TRACES} slug={slug} />
                </div>
                <button
                  onClick={() => setShowSample(false)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  {t.humanReview.backToOnboarding}
                </button>
              </Stack>
            ) : (
              <EmptyOnboarding
                slug={slug}
                onShowSample={() => setShowSample(true)}
                t={t}
              />
            )}
          </Stack>
        )}
      </div>
    </div>
  );
}

// ─── Stats helper ────────────────────────────────────────────────────────────

function computeStats(traces: Trace[]) {
  const total = traces.length;
  const tracesWithHuman = traces.filter((tr) =>
    tr.annotations.some((a) => a.annotatorKind === "HUMAN"),
  ).length;
  const coveragePct = total > 0 ? Math.round((tracesWithHuman / total) * 100) : 0;

  const pairs = pairsFromTraces(traces);
  const comparable = pairs.length;
  const diffCount = pairs.filter((p) => p.isDiff).length;
  const diffPct = comparable > 0 ? Math.round((diffCount / comparable) * 100) : 0;
  const agreePct = comparable > 0 ? 100 - diffPct : 0;

  const evalNames = Array.from(new Set(pairs.map((p) => p.evalName)));

  return {
    total,
    tracesWithHuman,
    coveragePct,
    comparable,
    diffCount,
    diffPct,
    agreePct,
    evalNames,
  };
}

// ─── Empty onboarding ────────────────────────────────────────────────────────

function EmptyOnboarding({
  slug,
  onShowSample,
  t,
}: {
  slug: string;
  onShowSample: () => void;
  t: ReturnType<typeof useT>;
}) {
  const recentHref = `/${slug}/requests`;
  const steps = [
    t.humanReview.emptyStep1,
    t.humanReview.emptyStep2,
    t.humanReview.emptyStep3,
    t.humanReview.emptyStep4,
  ];

  return (
    <SectionCard
      title={t.humanReview.emptyTitle}
      description={t.humanReview.emptyHowTo}
      variant="bordered"
    >
      <ol className="mt-3 space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-baseline gap-4">
            <span
              className="w-6 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground/60"
              style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace" }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-sm leading-snug">{step}</span>
          </li>
        ))}
      </ol>

      <Inline gap="sm" className="mt-6 border-t pt-4">
        <Link
          href={recentHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:bg-foreground/90"
        >
          {t.humanReview.openRecentTrace} <ArrowRight className="size-3" />
        </Link>
        <button
          onClick={onShowSample}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted"
        >
          <Eye className="size-3" /> {t.humanReview.viewSample}
        </button>
      </Inline>
    </SectionCard>
  );
}
