"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { type TraceTree, type Annotation } from "@/lib/phoenix";
import { AnnotationBadges } from "@/components/annotation-badge";
import { AnnotationForm } from "@/components/modals/annotation-form";
import { apiFetch } from "@/lib/api-client";
import { Bot, User, FileJson, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "io" | "evaluations" | "annotations";

interface Props {
  trace: TraceTree;
  projectId?: string;
  onRefresh: () => void;
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

export function TraceDetailTabs({ trace, projectId, onRefresh }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("io");
  const [enabledEvals, setEnabledEvals] = useState<string[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [annotateOpen, setAnnotateOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    apiFetch(`/api/eval-config?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((d: { configs?: { evalName: string; enabled: boolean }[] }) => {
        const list = (d.configs ?? []).filter((c) => c.enabled).map((c) => c.evalName);
        setEnabledEvals(list);
      })
      .catch(() => {});
  }, [projectId]);

  const root = trace.rootSpan;
  const { llm, human } = partitionAnnotations(root.annotations);

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center border-b">
        <TabBtn active={tab === "io"} onClick={() => setTab("io")}>
          <FileJson className="size-3" /> {t.traceTabs.inputOutput}
        </TabBtn>
        <TabBtn active={tab === "evaluations"} onClick={() => setTab("evaluations")}>
          <Bot className="size-3" /> {t.traceTabs.evaluations}
          <CountBadge n={llm.length} />
        </TabBtn>
        <TabBtn active={tab === "annotations"} onClick={() => setTab("annotations")}>
          <User className="size-3" /> {t.traceTabs.annotations}
          <CountBadge n={human.length} />
        </TabBtn>
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
        {tab === "evaluations" && (
          <EvaluationsPanel
            annotations={llm}
            enabledEvals={enabledEvals}
            pendingLabel={t.traceTabs.pendingShort}
            pendingTitle={t.traceTabs.pending}
            empty={t.traceTabs.noEvaluations}
          />
        )}
        {tab === "annotations" && (
          <AnnotationsPanel
            annotations={human}
            empty={t.traceTabs.noAnnotations}
            addLabel={t.traceTabs.addAnnotation}
            onAdd={() => setAnnotateOpen(true)}
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

      <AnnotationForm
        open={annotateOpen}
        onClose={() => setAnnotateOpen(false)}
        spanId={root.spanId}
        existingAnnotations={root.annotations}
        onSaved={onRefresh}
      />
    </div>
  );
}

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

function IoPanel({
  input,
  output,
  t,
}: {
  input: string;
  output: string;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {t.traceTabs.input}
        </p>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 font-mono text-xs">
          {input || "—"}
        </pre>
      </div>
      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {t.traceTabs.output}
        </p>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 font-mono text-xs">
          {output || "—"}
        </pre>
      </div>
    </div>
  );
}

function EvaluationsPanel({
  annotations,
  enabledEvals,
  pendingLabel,
  pendingTitle,
  empty,
}: {
  annotations: Annotation[];
  enabledEvals: string[];
  pendingLabel: string;
  pendingTitle: string;
  empty: string;
}) {
  const haveNames = new Set(annotations.map((a) => a.name));
  const pending = enabledEvals.filter((n) => !haveNames.has(n));

  if (annotations.length === 0 && pending.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AnnotationBadges annotations={annotations} />
      {pending.map((name) => (
        <span
          key={`pending-${name}`}
          title={pendingTitle}
          className="inline-flex items-center gap-1 rounded border border-dashed border-foreground/20 px-2 py-1 font-mono text-[10px] text-muted-foreground"
        >
          {name} <span className="font-bold">{pendingLabel}</span>
        </span>
      ))}
    </div>
  );
}

function AnnotationsPanel({
  annotations,
  empty,
  addLabel,
  onAdd,
}: {
  annotations: Annotation[];
  empty: string;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      {annotations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <AnnotationBadges annotations={annotations} />
      )}
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        <Plus className="size-3" /> {addLabel}
      </button>
    </div>
  );
}
