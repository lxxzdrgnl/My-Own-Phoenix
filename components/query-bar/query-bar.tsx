// components/query-bar/query-bar.tsx
"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { parseQuery, serializeQuery } from "@/lib/query/parser";
import type { QueryAST } from "@/lib/query/types";

interface Props {
  /** Current AST (source of truth, owned by parent). */
  ast: QueryAST;
  /** Called with parsed AST after the user pauses typing (debounced). */
  onChange: (ast: QueryAST, rawText: string) => void;
  /** Set of annotation names known to the project, for token classification. */
  knownAnnotations: ReadonlySet<string>;
}

const DEBOUNCE_MS = 200;

export function QueryBar({ ast, onChange, knownAnnotations }: Props) {
  const t = useT();

  // Local text mirrors the AST when it changes externally (chip clicks).
  // Local edits debounce-parse back into an AST.
  const serialized = useMemo(() => serializeQuery(ast), [ast]);
  const [text, setText] = useState(serialized);
  const lastExternalRef = useRef(serialized);

  // Re-sync local text when parent ast changes from outside (e.g. chip click).
  useEffect(() => {
    if (serialized !== lastExternalRef.current) {
      setText(serialized);
      lastExternalRef.current = serialized;
    }
  }, [serialized]);

  // Debounce user typing -> parse -> emit.
  useEffect(() => {
    if (text === lastExternalRef.current) return;
    const handle = setTimeout(() => {
      const { ast: nextAst } = parseQuery(text, knownAnnotations);
      lastExternalRef.current = text;
      onChange(nextAst, text);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [text, knownAnnotations, onChange]);

  // Inline error indicator: parse synchronously for display only (cheap).
  const { errors } = useMemo(
    () => parseQuery(text, knownAnnotations),
    [text, knownAnnotations],
  );
  const hasErrors = errors.length > 0;

  return (
    <div className="w-full">
      <div className="relative w-full">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.projects.queryPlaceholder}
          className={`h-9 w-full pl-8 pr-9 text-sm font-mono ${
            hasErrors ? "border-destructive" : ""
          }`}
          spellCheck={false}
          autoComplete="off"
        />
        {text && (
          <button
            type="button"
            aria-label={t.projects.clear}
            onClick={() => setText("")}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>
      {hasErrors && (
        <p className="mt-1 text-xs text-destructive">
          {t.projects.queryInvalid}: {errors.map((e) => e.raw).join(", ")}
        </p>
      )}
    </div>
  );
}
