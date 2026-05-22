"use client";

import { useMemo } from "react";
import { Shield, ShieldCheck } from "lucide-react";
import {
  parseGuardrailDetections,
  type GuardrailDetection,
  type RawSpan,
} from "@/lib/phoenix";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  buildHighlightSegments,
  locateMaskedRanges,
  type HighlightSegment,
} from "./guardrail-diff";

function HighlightedText({
  segments,
  emptyLabel,
}: {
  segments: HighlightSegment[];
  emptyLabel: string;
}) {
  if (segments.length === 0) {
    return <span className="text-muted-foreground italic">{emptyLabel}</span>;
  }
  return (
    <>
      {segments.map((seg, i) =>
        seg.highlighted ? (
          <mark
            key={i}
            className="rounded-sm bg-red-500/20 px-0.5 text-foreground"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

export interface GuardrailDetailProps {
  span: Pick<
    RawSpan,
    | "input"
    | "output"
    | "guardrailTriggered"
    | "guardrailDetections"
    | "guardrailType"
  > & { spanKind?: string };
}

export function GuardrailDetail({ span }: GuardrailDetailProps) {
  const t = useT();
  // Defensive parse: if for some reason `guardrailDetections` was not
  // populated (e.g. caller hand-built a RawSpan), fall back to []. The
  // builder in lib/phoenix.ts already calls parseGuardrailDetections.
  const detections: GuardrailDetection[] = useMemo(() => {
    if (span.guardrailDetections) return span.guardrailDetections;
    return parseGuardrailDetections(undefined);
  }, [span.guardrailDetections]);

  const triggered = span.guardrailTriggered === true;
  const original = span.input ?? "";
  const masked = span.output ?? "";

  const inputSegments = useMemo(
    () => buildHighlightSegments(original, detections),
    [original, detections],
  );
  const outputSegments = useMemo(
    () =>
      buildHighlightSegments(masked, locateMaskedRanges(masked, detections)),
    [masked, detections],
  );

  const Icon = triggered ? Shield : ShieldCheck;

  return (
    <div className="flex h-full flex-col">
      {/* Header strip */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded",
              triggered
                ? "bg-red-500/15 text-red-600 dark:text-red-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-3" />
          </span>
          <h3 className="truncate text-sm font-semibold">
            {t.projects.guardrailHeading}
            {span.guardrailType ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({span.guardrailType})
              </span>
            ) : null}
          </h3>
          <span
            className={cn(
              "ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium",
              triggered
                ? "bg-red-500/15 text-red-600 dark:text-red-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {triggered
              ? t.projects.guardrailTriggered
              : t.projects.guardrailPassed}
          </span>
          {triggered && detections.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              · {detections.length} {t.projects.guardrailDetections}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        {triggered ? (
          <>
            {/* Side-by-side diff */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t.projects.guardrailOriginal}
                </p>
                <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-xs leading-relaxed font-mono text-foreground/80">
                  <HighlightedText
                    segments={inputSegments}
                    emptyLabel={t.projects.guardrailOriginal}
                  />
                </pre>
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t.projects.guardrailMasked}
                </p>
                <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-xs leading-relaxed font-mono text-foreground/80">
                  <HighlightedText
                    segments={outputSegments}
                    emptyLabel={t.projects.guardrailMasked}
                  />
                </pre>
              </div>
            </div>

            {/* Detections table */}
            {detections.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-xs font-semibold">
                  {t.projects.guardrailDetectionsTitle}
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30 text-left">
                        <th className="px-3 py-1.5 font-medium text-muted-foreground">
                          {t.projects.guardrailColType}
                        </th>
                        <th className="px-3 py-1.5 font-medium text-muted-foreground">
                          {t.projects.guardrailColRange}
                        </th>
                        <th className="px-3 py-1.5 font-medium text-muted-foreground">
                          {t.projects.guardrailColMasked}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detections.map((d, i) => (
                        <tr key={i} className="border-b last:border-b-0">
                          <td className="px-3 py-1.5 font-mono">
                            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-600 dark:text-red-400">
                              {d.type}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground tabular-nums">
                            {d.start}–{d.end}
                          </td>
                          <td className="px-3 py-1.5 font-mono">{d.masked}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          // Pass case: show original only + reassurance message
          <>
            <div className="mb-3 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="size-3.5" />
              {t.projects.guardrailNoPii}
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t.projects.guardrailOriginal}
              </p>
              <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-xs leading-relaxed font-mono text-foreground/80">
                {original || (
                  <span className="text-muted-foreground italic">
                    {t.projects.guardrailOriginal}
                  </span>
                )}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
