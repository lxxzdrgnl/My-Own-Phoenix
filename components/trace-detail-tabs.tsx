"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useT } from "@/lib/i18n";
import { type TraceTree, type Annotation } from "@/lib/phoenix";
import { AnnotationBadge } from "@/components/annotation-badge";
import { apiFetch } from "@/lib/api-client";
import { Bot, User, FileJson, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function TraceDetailTabs({ trace, projectId, projectName, onRefresh }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("io");
  const [enabledEvals, setEnabledEvals] = useState<string[]>([]);
  const [evalMeta, setEvalMeta] = useState<Map<string, EvalMeta>>(new Map());
  const [showRaw, setShowRaw] = useState(false);
  const [savingName, setSavingName] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/eval-prompts")
      .then((r) => r.json())
      .then((d: { prompts?: Array<{ name: string; outputMode?: string }> }) => {
        const m = new Map<string, EvalMeta>();
        for (const p of d.prompts ?? []) {
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
    try {
      const res = await apiFetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spanId: trace.rootSpan.spanId,
          name,
          label,
          score,
          explanation: explanation || undefined,
        }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      onRefresh?.();
    } catch (e) {
      console.error("[trace-detail-tabs] save annotation failed", e);
    } finally {
      setSavingName(null);
    }
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
      onRefresh?.();
    } catch (e) {
      console.error("[trace-detail-tabs] delete annotation failed", e);
    } finally {
      setSavingName(null);
    }
  }

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
  // Count unique eval names (deduped between AI + Human), not sum of rows.
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
            empty={t.traceTabs.noEvals}
            aiLabel={t.traceTabs.aiColumn}
            humanLabel={t.traceTabs.humanColumn}
            pendingLabel={t.traceTabs.pendingShort}
            pendingTitle={t.traceTabs.pending}
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

function PendingCell({ onClick, title, label }: { onClick?: () => void; title: string; label: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded border border-foreground/10 px-2 py-1 font-mono text-[9px] leading-none text-muted-foreground/60"
      onClick={onClick}
    >
      {label}
    </span>
  );
}

// Compact rating control: shows Pass/Fail buttons (binary) or % input (score).
// Always inline, no popup. Saves immediately on click/blur.
function RatePart({
  mode,
  existing,
  disabled,
  onSave,
  onDelete,
}: {
  mode: "binary" | "score";
  existing: Annotation | undefined;
  disabled: boolean;
  onSave: (label: "pass" | "fail", score: number) => void;
  onDelete: () => void;
}) {
  // "Rated" requires an actual label — empty label means HUMAN row exists only
  // to hold a description and hasn't been graded yet.
  const isRated = !!(existing && existing.label);
  const [scoreText, setScoreText] = useState(
    isRated && mode === "score" ? String(Math.round(existing!.score * 100)) : "",
  );
  const lastSavedScore = useRef(scoreText);
  useEffect(() => {
    const next = isRated && mode === "score" ? String(Math.round(existing!.score * 100)) : "";
    setScoreText(next);
    lastSavedScore.current = next;
  }, [existing?.score, existing?.label, isRated, mode]);

  if (isRated) {
    return <AnnotationBadge annotation={existing!} onDelete={onDelete} />;
  }

  if (mode === "binary") {
    return (
      <div className="inline-flex items-center overflow-hidden rounded border border-foreground/15 leading-none">
        <button
          type="button"
          onClick={() => onSave("pass", 1.0)}
          disabled={disabled}
          className="px-2 py-1 font-mono text-[9px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-foreground hover:text-background disabled:opacity-40"
        >
          Pass
        </button>
        <span className="h-3 w-px bg-foreground/15" />
        <button
          type="button"
          onClick={() => onSave("fail", 0.0)}
          disabled={disabled}
          className="px-2 py-1 font-mono text-[9px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-foreground hover:text-background disabled:opacity-40"
        >
          Fail
        </button>
      </div>
    );
  }

  // Score mode: inline % input. Input is 0–100 (whole percent); we normalize
  // to Phoenix's 0–1 score by dividing by 100. So "1" = 1% (not 100%).
  const commit = () => {
    if (scoreText === "" || scoreText === lastSavedScore.current) return;
    const n = Number(scoreText);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(0, Math.min(100, n));
    const normalized = clamped / 100;
    lastSavedScore.current = scoreText;
    onSave(normalized >= 0.5 ? "pass" : "fail", normalized);
  };

  return (
    <div className="inline-flex items-center overflow-hidden rounded border border-foreground/15 leading-none">
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={scoreText}
        onChange={(e) => setScoreText(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={disabled}
        placeholder="0-100"
        className="w-16 bg-transparent px-2 py-1 font-mono text-[9px] tabular-nums uppercase outline-none placeholder:text-muted-foreground/40 focus:bg-background"
      />
      <span className="border-l border-foreground/15 bg-foreground/[0.03] px-1.5 py-1 font-mono text-[9px] text-muted-foreground">
        %
      </span>
    </div>
  );
}

// Always-editable description cell, like an Excel cell with no border.
// Saves on blur, but only if the value changed.
function DescriptionCell({
  initial,
  disabled,
  placeholder = "설명 …",
  onCommit,
}: {
  initial: string;
  disabled: boolean;
  placeholder?: string;
  onCommit: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  const lastSaved = useRef(initial);

  useEffect(() => {
    setText(initial);
    lastSaved.current = initial;
  }, [initial]);

  const commit = () => {
    if (text === lastSaved.current) return;
    lastSaved.current = text;
    onCommit(text.trim());
  };

  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      disabled={disabled}
      placeholder={placeholder}
      className="block w-full bg-transparent px-2 py-2 text-[11px] outline-none placeholder:text-muted-foreground/40 focus:bg-background disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

function EvalsPanel({
  llm,
  human,
  enabledEvals,
  evalMeta,
  savingName,
  onRate,
  onDelete,
  empty,
  aiLabel,
  humanLabel,
  pendingLabel,
  pendingTitle,
}: {
  llm: Annotation[];
  human: Annotation[];
  enabledEvals: string[];
  evalMeta: Map<string, EvalMeta>;
  savingName: string | null;
  onRate: (name: string, label: string, score: number, explanation: string) => void;
  onDelete: (name: string) => void;
  empty: string;
  aiLabel: string;
  humanLabel: string;
  pendingLabel: string;
  pendingTitle: string;
}) {
  // Collect all eval names from: enabled list, AI annotations, human annotations
  const rows = useMemo(() => {
    const names = new Set<string>();
    enabledEvals.forEach((n) => names.add(n));
    llm.forEach((a) => names.add(a.name));
    human.forEach((a) => names.add(a.name));
    const llmByName = new Map(llm.map((a) => [a.name, a]));
    const humanByName = new Map(human.map((a) => [a.name, a]));
    return Array.from(names)
      .sort()
      .map((name) => ({
        name,
        ai: llmByName.get(name),
        human: humanByName.get(name),
      }));
  }, [enabledEvals, llm, human]);

  if (rows.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{empty}</p>;
  }

  // 5-col grid: name | AI badge | AI description | Human rate | Human description
  const cols = "grid-cols-[8rem_7rem_minmax(8rem,1fr)_7rem_minmax(8rem,1fr)]";

  return (
    <div className="rounded border border-foreground/10">
      {/* Header */}
      <div className={cn("grid items-center border-b bg-muted/40 text-[10px] font-medium uppercase tracking-wider text-muted-foreground", cols)}>
        <div className="px-3 py-1.5">&nbsp;</div>
        <div className="px-3 py-1.5 inline-flex items-center gap-1">
          <Bot className="size-3" /> {aiLabel}
        </div>
        <div className="px-3 py-1.5 text-muted-foreground/60">AI Description</div>
        <div className="px-3 py-1.5 inline-flex items-center gap-1">
          <User className="size-3" /> {humanLabel}
        </div>
        <div className="px-3 py-1.5 text-muted-foreground/60">Human Description</div>
      </div>
      {/* Rows */}
      {rows.map((row, i) => {
        const mode =
          evalMeta.get(row.name)?.outputMode ??
          (row.ai && row.ai.score !== 0 && row.ai.score !== 1 ? "score" : "binary");
        const existing = row.human as
          | (Annotation & { explanation?: string })
          | undefined;
        return (
          <div
            key={row.name}
            className={cn(
              "grid items-start text-xs",
              cols,
              i % 2 === 1 && "bg-muted/10",
            )}
          >
            <div className="px-3 py-1.5 truncate font-mono text-[11px] text-foreground/80" title={row.name}>
              {row.name}
            </div>
            <div className="px-3 py-1.5">
              {row.ai ? (
                <AnnotationBadge annotation={row.ai} />
              ) : (
                <PendingCell label={pendingLabel} title={pendingTitle} />
              )}
            </div>
            <div className="px-3 py-2 text-[11px] leading-snug text-muted-foreground/80 break-words" title={row.ai?.explanation ?? ""}>
              {row.ai?.explanation || <span className="text-muted-foreground/30">—</span>}
            </div>
            <div className="px-3 py-1.5">
              <RatePart
                mode={mode}
                existing={existing}
                disabled={savingName === row.name}
                onSave={(label, score) =>
                  onRate(row.name, label, score, existing?.explanation ?? "")
                }
                onDelete={() => onDelete(row.name)}
              />
            </div>
            <div className="py-1">
              {(() => {
                const hasHumanRating = !!(existing && existing.label);
                return (
                  <DescriptionCell
                    initial={existing?.explanation ?? ""}
                    disabled={savingName === row.name || !hasHumanRating}
                    placeholder={hasHumanRating ? "설명 …" : "—"}
                    onCommit={(text) => {
                      if (!hasHumanRating) return;
                      onRate(
                        row.name,
                        existing!.label,
                        existing!.score,
                        text,
                      );
                    }}
                  />
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
