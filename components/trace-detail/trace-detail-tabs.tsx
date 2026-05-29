"use client";

import { logger } from "@/lib/logger";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { type TraceTree, type Annotation } from "@/lib/phoenix";
import { apiFetch } from "@/lib/api-client";
import { useFormSubmit } from "@/lib/hooks/use-form-submit";
import { FileJson, ChevronDown, Play } from "lucide-react";
import { cn } from "@/lib/utils";

import { IoPanel } from "./tabs/io-panel";
import { EvalsPanel } from "./tabs/evals-panel";

type Tab = "io" | "evals";

interface Props {
  trace: TraceTree;
  projectId?: string;
  /** Phoenix project name (slug) — used for Phoenix DELETE call which is project-scoped. */
  projectName?: string;
  onRefresh?: () => void;
}

function partitionAnnotations(arr: Annotation[]): { llm: Annotation[]; human: Annotation[] } {
  const llm: Annotation[] = [];
  const human: Annotation[] = [];
  for (const a of arr) {
    if (a.annotatorKind === "HUMAN") human.push(a);
    else llm.push(a);
  }
  return { llm, human };
}

type EvalMeta = { name: string; outputMode: "binary" | "score" };

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="rounded bg-muted px-1.5 text-[10px] tabular-nums">{n}</span>
  );
}

export function TraceDetailTabs({ trace, projectId, projectName, onRefresh }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("io");
  const [enabledEvals, setEnabledEvals] = useState<string[]>([]);
  const [evalMeta, setEvalMeta] = useState<Map<string, EvalMeta>>(new Map());
  const [showRaw, setShowRaw] = useState(false);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [runningEval, setRunningEval] = useState<string | null>(null);
  // 재실행 후 부모 갱신을 기다리지 않고 이 트레이스의 root annotation을 직접 재페치해 즉시 반영.
  const [annOverride, setAnnOverride] = useState<Annotation[] | null>(null);

  const refreshAnnotations = useCallback(async () => {
    if (!projectName) return;
    const sid = trace.rootSpan.spanId;
    try {
      const r = await apiFetch(`/api/v1/projects/${encodeURIComponent(projectName)}/span_annotations?span_ids=${encodeURIComponent(sid)}&limit=1000`);
      const data = await r.json();
      const anns: Annotation[] = (data.data ?? [])
        .filter((a: { span_id?: string }) => a.span_id === sid)
        .map((a: { name: string; annotator_kind?: string; result?: { label?: string; score?: number; explanation?: string } }) => ({
          name: a.name,
          label: a.result?.label ?? "",
          score: a.result?.score ?? 0,
          annotatorKind: (a.annotator_kind ?? undefined) as Annotation["annotatorKind"],
          explanation: a.result?.explanation ?? "",
        }));
      setAnnOverride(anns);
    } catch (e) { logger.error("trace-detail-tabs refresh annotations failed", e); }
  }, [projectName, trace.rootSpan.spanId]);

  // 부모가 새 trace를 전달하면(예: 다른 트레이스 선택) override 해제
  useEffect(() => { setAnnOverride(null); }, [trace.traceId]);

  const { submit: submitAnnotation } = useFormSubmit<{
    spanId: string;
    name: string;
    label: string;
    score: number;
    explanation?: string;
  }>("/api/annotations", "POST", { onSuccess: () => { void refreshAnnotations(); onRefresh?.(); } });

  async function runSingleEval(name: string) {
    if (!projectName) return;
    setRunningEval(name);
    try {
      const res = await apiFetch("/api/eval-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: projectName,
          traceId: trace.traceId,
          evalNames: [name],
        }),
      });
      if (!res.ok) throw new Error(`run ${res.status}`);
      await refreshAnnotations();
      onRefresh?.();
    } catch (e) {
      logger.error("trace-detail-tabs run eval failed", e);
    } finally {
      setRunningEval(null);
    }
  }

  async function runAllEvals() {
    if (!projectName) return;
    setRunningEval("__all__");
    try {
      const res = await apiFetch("/api/eval-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: projectName,
          traceId: trace.traceId,
          evalNames: [],
        }),
      });
      if (!res.ok) throw new Error(`run all ${res.status}`);
      await refreshAnnotations();
      onRefresh?.();
    } catch (e) {
      logger.error("trace-detail-tabs run all evals failed", e);
    } finally {
      setRunningEval(null);
    }
  }

  useEffect(() => {
    apiFetch("/api/eval-prompts")
      .then((r) => r.json())
      .then((d: { items?: Array<{ name: string; outputMode?: string }> }) => {
        const m = new Map<string, EvalMeta>();
        for (const p of d.items ?? []) {
          m.set(p.name, { name: p.name, outputMode: p.outputMode === "score" ? "score" : "binary" });
        }
        setEvalMeta(m);
      })
      .catch(() => {});
  }, []);

  async function saveHumanAnnotation(
    name: string,
    label: string,
    score: number,
    explanation: string,
  ) {
    setSavingName(name);
    await submitAnnotation({
      spanId: trace.rootSpan.spanId,
      name,
      label,
      score,
      explanation: explanation || undefined,
    });
    setSavingName(null);
  }

  async function deleteHumanAnnotation(name: string) {
    setSavingName(name);
    try {
      const res = await apiFetch(
        `/api/annotations?spanId=${encodeURIComponent(trace.rootSpan.spanId)}&name=${encodeURIComponent(name)}&kind=HUMAN`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`delete ${res.status}: ${txt}`);
      }
      await refreshAnnotations();
      onRefresh?.();
    } catch (e) {
      logger.error("trace-detail-tabs delete annotation failed", e);
    } finally {
      setSavingName(null);
    }
  }

  useEffect(() => {
    if (!projectId) return;
    apiFetch(`/api/eval-config?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((d: { items?: { evalName: string; enabled: boolean }[] }) => {
        const list = (d.items ?? []).filter((c) => c.enabled).map((c) => c.evalName);
        setEnabledEvals(list);
      })
      .catch(() => {});
  }, [projectId]);

  const root = trace.rootSpan;
  const { llm, human } = partitionAnnotations(annOverride ?? root.annotations);
  const uniqueEvalCount = useMemo(() => {
    const s = new Set<string>();
    llm.forEach((a) => s.add(a.name));
    human.forEach((a) => s.add(a.name));
    return s.size;
  }, [llm, human]);

  return (
    <div className="bg-card">
      <div className="flex items-center border-b">
        <TabBtn active={tab === "io"} onClick={() => setTab("io")}>
          <FileJson className="size-3" /> {t.traceTabs.inputOutput}
        </TabBtn>
        <TabBtn active={tab === "evals"} onClick={() => setTab("evals")}>
          {t.traceTabs.evals}
          <CountBadge n={uniqueEvalCount} />
        </TabBtn>
        {tab === "evals" && (
          <button
            type="button"
            onClick={runAllEvals}
            disabled={runningEval !== null}
            title="전체 평가 다시 실행"
            className="ml-2 inline-flex items-center gap-1 rounded border border-foreground/15 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-foreground hover:text-background disabled:opacity-40"
          >
            <Play className={cn("size-2.5", runningEval === "__all__" && "animate-pulse")} />
            전체 실행
          </button>
        )}
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="ml-auto inline-flex items-center gap-1 px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {t.traceTabs.raw}
          <ChevronDown className={cn("size-3 transition-transform", showRaw && "rotate-180")} />
        </button>
      </div>

      <div className="p-4">
        {tab === "io" && <IoPanel input={root.input} output={root.output} t={t} />}
        {tab === "evals" && (
          <EvalsPanel
            llm={llm}
            human={human}
            enabledEvals={enabledEvals}
            evalMeta={evalMeta}
            savingName={savingName}
            onRate={saveHumanAnnotation}
            onDelete={deleteHumanAnnotation}
            onRunSingle={runSingleEval}
            runningEval={runningEval}
            empty={t.traceTabs.noEvals}
            aiLabel={t.traceTabs.aiColumn}
            humanLabel={t.traceTabs.humanColumn}
            pendingLabel={t.traceTabs.pendingShort}
            pendingTitle="클릭하여 이 평가 즉시 실행"
          />
        )}
      </div>

      {showRaw && (
        <div className="border-t p-4">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            {t.traceTabs.rawDescription}
          </p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-foreground/70">
            {JSON.stringify(root, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
