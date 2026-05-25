import { type RawSpan } from "@/lib/phoenix";
import {
  Bot,
  Link2,
  Search,
  MessageSquare,
  Box,
  Zap,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { CheckCircle2, XCircle } from "lucide-react";

// ─── Span icon/color styles ───────────────────────────────────────────────────

export const SPAN_STYLES: Record<string, { icon: typeof Bot; bg: string; fg: string }> = {
  LLM:            { icon: Bot,            bg: "bg-[#e8f5e9] dark:bg-[#2d4a2e]",  fg: "text-[#2e7d32] dark:text-[#6fcf6f]" },
  CHAIN:          { icon: Link2,          bg: "bg-[#e3eafc] dark:bg-[#2e3a5b]",  fg: "text-[#3555c4] dark:text-[#6b8cff]" },
  RETRIEVER:      { icon: Search,         bg: "bg-[#fce4ec] dark:bg-[#4a2d3a]",  fg: "text-[#b0446e] dark:text-[#e07baf]" },
  TOOL:           { icon: Box,            bg: "bg-[#fef3e2] dark:bg-[#4a3b2d]",  fg: "text-[#b57530] dark:text-[#e0a86b]" },
  PROMPT:         { icon: MessageSquare,  bg: "bg-[#f3e5f5] dark:bg-[#3b2d4a]",  fg: "text-[#7b40a0] dark:text-[#b07be0]" },
  GUARDRAIL:      { icon: Shield,         bg: "bg-red-500/15",                    fg: "text-red-600 dark:text-red-400" },
  GUARDRAIL_PASS: { icon: ShieldCheck,    bg: "bg-muted",                         fg: "text-muted-foreground" },
  DEFAULT:        { icon: Zap,            bg: "bg-muted",                         fg: "text-muted-foreground" },
};

/**
 * Look up the visual style for a span. Accepts either a full RawSpan
 * (preferred — lets us branch on guardrail.triggered for GUARDRAIL
 * spans) or a bare kind string (legacy callers).
 */
export function getSpanStyle(arg: RawSpan | string) {
  if (typeof arg === "string") {
    return SPAN_STYLES[arg.toUpperCase()] ?? SPAN_STYLES.DEFAULT;
  }
  const kind = (arg.spanKind ?? "").toUpperCase();
  if (kind === "GUARDRAIL" && arg.guardrailTriggered !== true) {
    return SPAN_STYLES.GUARDRAIL_PASS;
  }
  return SPAN_STYLES[kind] ?? SPAN_STYLES.DEFAULT;
}

// ─── Status Icon ─────────────────────────────────────────────────────────────

export function StatusIcon({ status }: { status: string }) {
  const ok = status === "OK" || status === "UNSET" || !status;
  return ok
    ? <CheckCircle2 className="size-3.5 text-emerald-500" />
    : <XCircle className="size-3.5 text-red-500" />;
}

// ─── Timeline bar colors ──────────────────────────────────────────────────────

export const SPAN_BAR_COLORS: Record<string, string> = {
  LLM: "#a5d6a7",
  CHAIN: "#a3b8f0",
  RETRIEVER: "#e091ab",
  TOOL: "#e0a86b",
  AGENT: "#b0b0b0",
  PROMPT: "#c4a0d8",
  GUARDRAIL: "#dc2626",       // triggered (red)
  GUARDRAIL_PASS: "#9ca3af",  // pass (gray)
};

/**
 * Resolve the timeline-bar color for a span. GUARDRAIL spans switch
 * red→gray based on `guardrail.triggered`.
 */
export function getSpanBarColor(span: RawSpan): string {
  const kind = (span.spanKind ?? "").toUpperCase();
  if (kind === "GUARDRAIL") {
    return span.guardrailTriggered === true
      ? SPAN_BAR_COLORS.GUARDRAIL
      : SPAN_BAR_COLORS.GUARDRAIL_PASS;
  }
  return SPAN_BAR_COLORS[kind] ?? "#888";
}
