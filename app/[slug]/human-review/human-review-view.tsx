"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Users, ArrowRight, Eye } from "lucide-react";
import { useT } from "@/lib/i18n";
import { fetchTraces, type Trace } from "@/lib/phoenix";
import { useProjectSse } from "@/lib/hooks/use-project-sse";
import { AiHumanComparison } from "@/components/dashboard/widgets/ai-human-comparison";
import { LoadingState } from "@/components/ui/empty-state";

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
  const [loading, setLoading] = useState(true);
  const [showSample, setShowSample] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ts = await fetchTraces(phoenixProject);
      ts.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setTraces(ts);
    } catch (e) {
      console.error(e);
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

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center gap-2">
          <Users className="size-5" />
          <h1 className="text-xl font-semibold tracking-tight">{t.humanReview.title}</h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">{t.humanReview.pageDescription}</p>

        {loading ? (
          <LoadingState />
        ) : hasHuman ? (
          <AiHumanComparison traces={traces} projectId={projectId} slug={slug} />
        ) : showSample ? (
          <div>
            <div className="mb-3 inline-block rounded-md border border-dashed bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
              {t.humanReview.sampleBadge}
            </div>
            <div className="opacity-70">
              <AiHumanComparison traces={SAMPLE_TRACES} slug={slug} />
            </div>
            <button
              onClick={() => setShowSample(false)}
              className="mt-4 text-xs text-muted-foreground hover:text-foreground"
            >
              ← back
            </button>
          </div>
        ) : (
          <EmptyOnboarding traces={traces} slug={slug} onShowSample={() => setShowSample(true)} t={t} />
        )}
      </div>
    </div>
  );
}

function EmptyOnboarding({
  traces,
  slug,
  onShowSample,
  t,
}: {
  traces: Trace[];
  slug: string;
  onShowSample: () => void;
  t: ReturnType<typeof useT>;
}) {
  const recentHref = `/${slug}/requests`;
  return (
    <div className="rounded-xl border bg-card p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="size-12 rounded-full bg-muted flex items-center justify-center">
          <Users className="size-6 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{t.humanReview.emptyTitle}</h2>
          <p className="text-xs text-muted-foreground">
            {t.humanReview.countSummary
              .replace("{covered}", "0")
              .replace("{total}", String(traces.length))
              .replace("{pct}", "0")}
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-muted/10 p-4 mb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          {t.humanReview.emptyHowTo}
        </p>
        <ol className="space-y-1.5 text-sm">
          <li className="flex gap-2">
            <span className="text-muted-foreground">1.</span>
            {t.humanReview.emptyStep1}
          </li>
          <li className="flex gap-2">
            <span className="text-muted-foreground">2.</span>
            {t.humanReview.emptyStep2}
          </li>
          <li className="flex gap-2">
            <span className="text-muted-foreground">3.</span>
            {t.humanReview.emptyStep3}
          </li>
          <li className="flex gap-2">
            <span className="text-muted-foreground">4.</span>
            {t.humanReview.emptyStep4}
          </li>
        </ol>
      </div>

      <div className="flex gap-2">
        <Link
          href={recentHref}
          className="inline-flex items-center gap-1.5 rounded-md border bg-foreground px-3 py-2 text-xs font-medium text-background hover:bg-foreground/90"
        >
          {t.humanReview.openRecentTrace} <ArrowRight className="size-3" />
        </Link>
        <button
          onClick={onShowSample}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"
        >
          <Eye className="size-3" /> {t.humanReview.viewSample}
        </button>
      </div>
    </div>
  );
}
