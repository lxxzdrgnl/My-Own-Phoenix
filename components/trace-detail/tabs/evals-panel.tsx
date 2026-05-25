"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { type Annotation } from "@/lib/phoenix";
import { AnnotationBadge } from "@/components/annotation-badge";
import { Bot, User, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type EvalMeta = { name: string; outputMode: "binary" | "score" };

// ─── Pending cell ─────────────────────────────────────────────────────────────

function PendingCell({ onClick, title, label, running }: {
  onClick?: () => void;
  title: string;
  label: string;
  running?: boolean;
}) {
  if (running) {
    return (
      <span className="inline-flex items-center rounded border border-foreground/15 px-2 py-1 font-mono text-[9px] leading-none text-muted-foreground">
        …
      </span>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className="inline-flex items-center rounded border border-foreground/10 px-2 py-1 font-mono text-[9px] leading-none text-muted-foreground/60 transition-colors hover:border-foreground/30 hover:bg-foreground/5 hover:text-foreground"
      >
        {label}
      </button>
    );
  }
  return (
    <span
      title={title}
      className="inline-flex items-center rounded border border-foreground/10 px-2 py-1 font-mono text-[9px] leading-none text-muted-foreground/60"
    >
      {label}
    </span>
  );
}

// ─── Rate Part (Pass/Fail or score input) ─────────────────────────────────────

export function RatePart({
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

  // Score mode: inline % input
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

// ─── Description Cell ─────────────────────────────────────────────────────────

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

// ─── Evals Panel ──────────────────────────────────────────────────────────────

export function EvalsPanel({
  llm,
  human,
  enabledEvals,
  evalMeta,
  savingName,
  onRate,
  onDelete,
  onRunSingle,
  runningEval,
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
  onRunSingle: (name: string) => void;
  runningEval: string | null;
  empty: string;
  aiLabel: string;
  humanLabel: string;
  pendingLabel: string;
  pendingTitle: string;
}) {
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
                <div className="group/ai inline-flex items-center gap-1">
                  <AnnotationBadge annotation={row.ai} />
                  <button
                    type="button"
                    onClick={() => onRunSingle(row.name)}
                    disabled={runningEval === row.name}
                    title="이 평가 다시 실행"
                    className="opacity-0 transition-opacity group-hover/ai:opacity-100 text-muted-foreground/60 hover:text-foreground"
                  >
                    <RefreshCw className={cn("size-2.5", runningEval === row.name && "animate-spin opacity-100")} />
                  </button>
                </div>
              ) : (
                <PendingCell
                  label={pendingLabel}
                  title={pendingTitle}
                  running={runningEval === row.name}
                  onClick={() => onRunSingle(row.name)}
                />
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
