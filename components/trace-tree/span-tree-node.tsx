"use client";

import { useState } from "react";
import { type RawSpan } from "@/lib/phoenix";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown } from "lucide-react";
import { getSpanStyle, StatusIcon } from "./span-style";
import { formatSec } from "./span-tree-helpers";

// ─── Span Tree Node (LangSmith style) ────────────────────────────────────────

export function SpanNode({
  span,
  depth,
  isLast,
  selectedId,
  onSelect,
}: {
  span: RawSpan;
  depth: number;
  isLast: boolean;
  selectedId: string | null;
  onSelect: (span: RawSpan) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = span.children.length > 0;
  const isSelected = selectedId === span.spanId;
  const style = getSpanStyle(span);
  const Icon = style.icon;

  return (
    <div className="relative">
      {/* Vertical connector line from parent */}
      {depth > 0 && (
        <div
          className="absolute top-0 w-px bg-border"
          style={{
            left: `${(depth - 1) * 24 + 19}px`,
            height: isLast ? "18px" : "100%",
          }}
        />
      )}

      {/* Horizontal connector line */}
      {depth > 0 && (
        <div
          className="absolute top-[18px] h-px bg-border"
          style={{
            left: `${(depth - 1) * 24 + 19}px`,
            width: "12px",
          }}
        />
      )}

      {/* Row */}
      <div
        onClick={() => onSelect(span)}
        className={cn(
          "relative flex items-center gap-1.5 py-1 pr-3 cursor-pointer rounded-md mx-1 transition-colors",
          isSelected
            ? "bg-accent"
            : "hover:bg-accent/50"
        )}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        {/* Expand/collapse */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setExpanded(!expanded);
          }}
          className="flex size-4 shrink-0 items-center justify-center"
        >
          {hasChildren ? (
            expanded
              ? <ChevronDown className="size-3 text-muted-foreground" />
              : <ChevronRight className="size-3 text-muted-foreground" />
          ) : (
            <span className="size-3" />
          )}
        </button>

        {/* Icon */}
        <span className={cn("flex size-5 shrink-0 items-center justify-center rounded", style.bg)}>
          <Icon className={cn("size-3", style.fg)} />
        </span>

        {/* Name */}
        <span className="truncate text-[13px] font-medium leading-none">
          {span.name}
        </span>

        {/* Model badge (if LLM) */}
        {span.model && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {span.model}
          </span>
        )}

        {/* Status */}
        <StatusIcon status={span.status} />

        {/* Latency */}
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {formatSec(span.latency)}
        </span>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="relative">
          {span.children.map((child, i) => (
            <SpanNode
              key={child.spanId}
              span={child}
              depth={depth + 1}
              isLast={i === span.children.length - 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
