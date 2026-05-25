"use client";

import { useT } from "@/lib/i18n";

export function IoPanel({
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
