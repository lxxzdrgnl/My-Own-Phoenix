// components/query-bar/chip-row.tsx
"use client";

import { useT } from "@/lib/i18n";
import type {
  AnnotationToken,
  AnnotationValue,
  NumericToken,
  QueryAST,
  Token,
} from "@/lib/query/types";

interface Props {
  ast: QueryAST;
  knownAnnotations: ReadonlySet<string>;
  onChange: (next: QueryAST) => void;
}

interface LatencyBucket {
  label: string;
  tok: NumericToken | null;
}

const LATENCY_BUCKETS: LatencyBucket[] = [
  { label: "all", tok: null },
  {
    label: "<1s",
    tok: {
      kind: "numeric",
      field: "latency",
      op: "<",
      value: 1000,
      negate: false,
      raw: "latency:<1s",
    },
  },
  {
    label: "1-3s",
    tok: {
      kind: "numeric",
      field: "latency",
      op: "between",
      value: [1000, 3000],
      negate: false,
      raw: "latency:1s..3s",
    },
  },
  {
    label: ">3s",
    tok: {
      kind: "numeric",
      field: "latency",
      op: ">",
      value: 3000,
      negate: false,
      raw: "latency:>3s",
    },
  },
];

export function ChipRow({ ast, knownAnnotations, onChange }: Props) {
  const t = useT();

  function replaceField(
    pred: (tok: Token) => boolean,
    replacement: Token | null,
  ) {
    const next: Token[] = ast.tokens.filter((tok) => !pred(tok));
    if (replacement) next.push(replacement);
    onChange({ ...ast, tokens: next });
  }

  function setAnnotation(name: string, value: AnnotationValue | "all") {
    const pred = (tok: Token) =>
      tok.kind === "annotation" && tok.name.toLowerCase() === name.toLowerCase();
    if (value === "all") {
      replaceField(pred, null);
      return;
    }
    const replacement: AnnotationToken = {
      kind: "annotation",
      name,
      values: [value],
      negate: false,
      raw: `${name}:${value}`,
    };
    replaceField(pred, replacement);
  }

  function currentAnnotationValue(name: string): AnnotationValue | "all" {
    const tok = ast.tokens.find(
      (tk): tk is AnnotationToken =>
        tk.kind === "annotation" && tk.name.toLowerCase() === name.toLowerCase(),
    );
    if (!tok) return "all";
    // Chip UI is single-select; multi-select lives in the querybar text form.
    return tok.values[0] ?? "all";
  }

  function currentLatencyLabel(): string {
    const tok = ast.tokens.find(
      (tk): tk is NumericToken =>
        tk.kind === "numeric" && tk.field === "latency",
    );
    if (!tok) return "all";
    if (tok.op === "<" && tok.value === 1000) return "<1s";
    if (tok.op === ">" && tok.value === 3000) return ">3s";
    if (
      tok.op === "between" &&
      Array.isArray(tok.value) &&
      tok.value[0] === 1000 &&
      tok.value[1] === 3000
    ) {
      return "1-3s";
    }
    // Custom value typed in querybar — chips show no active selection so a
    // chip click doesn't silently clobber the user's custom value.
    return "all";
  }

  function setLatency(bucket: LatencyBucket) {
    const pred = (tok: Token) =>
      tok.kind === "numeric" && tok.field === "latency";
    replaceField(pred, bucket.tok);
  }

  function toggleCombinator() {
    onChange({
      ...ast,
      annotationCombinator: ast.annotationCombinator === "AND" ? "OR" : "AND",
    });
  }

  const annotationNames = Array.from(knownAnnotations).sort();
  const showCombinatorToggle =
    ast.tokens.filter((tk) => tk.kind === "annotation").length >= 2;

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg border bg-muted/20 px-4 py-3">
      {annotationNames.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {t.projects.annotation}
            </p>
            {showCombinatorToggle && (
              <button
                type="button"
                onClick={toggleCombinator}
                className="rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider hover:bg-muted"
                title="Toggle annotation combinator"
              >
                {ast.annotationCombinator === "AND"
                  ? t.projects.combineAnd
                  : t.projects.combineOr}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {annotationNames.map((name) => {
              const current = currentAnnotationValue(name);
              return (
                <div key={name} className="flex items-center gap-2">
                  <span className="min-w-[8rem] text-xs font-medium">
                    {name}
                  </span>
                  {(["all", "pass", "fail", "none"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAnnotation(name, v)}
                      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                        current === v
                          ? "border-foreground bg-foreground text-background"
                          : "hover:bg-muted"
                      }`}
                    >
                      {v === "all"
                        ? t.projects.all
                        : v === "pass"
                          ? t.projects.pass
                          : v === "fail"
                            ? t.projects.fail
                            : t.projects.noAnnotation}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {t.projects.latency}
        </p>
        <div className="flex gap-1">
          {LATENCY_BUCKETS.map((b) => {
            const current = currentLatencyLabel();
            const active = current === b.label;
            return (
              <button
                key={b.label}
                type="button"
                onClick={() => setLatency(b)}
                className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "hover:bg-muted"
                }`}
              >
                {b.label === "all" ? t.projects.all : b.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
