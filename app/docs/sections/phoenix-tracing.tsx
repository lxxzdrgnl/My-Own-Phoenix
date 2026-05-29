"use client";

import { Fragment, useState } from "react";
import { CodeBlock, Callout, DocTable } from "../code-block";
import { useT } from "@/lib/i18n";

/* ── Mock trace data ── */
const MOCK_ANNOTATIONS = [
  { name: "BAN", label: "PASS" },
  { name: "QA", label: "PASS" },
  { name: "TOOL", score: 100 },
  { name: "GRD", label: "PASS" },
  { name: "HAL", score: 50 },
  { name: "CIT", score: 70 },
  { name: "RAG", score: 90 },
];

interface SpanNode {
  id: string;
  name: string;
  kind: "AGENT" | "CHAIN" | "LLM" | "TOOL" | "RETRIEVER" | "GUARDRAIL";
  model?: string;
  latency: string;
  status: "ok" | "error";
  input: string;
  output: string;
  tokens?: string;
  children?: SpanNode[];
}

const MOCK_SPANS: SpanNode = {
  id: "root",
  name: "Agent.run",
  kind: "AGENT",
  latency: "16.14s",
  status: "ok",
  tokens: "14,918 tokens (14457 + 461)",
  input: "Tell me about recent Google AI news",
  output:
    "Here are the latest Google AI developments:\n\n1. **Gemini 2.0** — Google released Gemini 2.0 with enhanced multimodal capabilities, including native image generation and improved reasoning.\n\n2. **Project Astra** — Real-time AI assistant that can see, hear, and understand the world through your device camera.\n\n3. **AlphaFold 3** — DeepMind expanded AlphaFold to predict structures of all biological molecules, not just proteins.\n\n4. **Veo 2** — Google's latest video generation model, producing high-quality 4K videos from text prompts.\n\n5. **NotebookLM Plus** — Enhanced version of the AI-powered research assistant with team collaboration features.",
  children: [
    {
      id: "planning",
      name: "planning",
      kind: "CHAIN",
      latency: "1.39s",
      status: "ok",
      input: "Plan search strategy for: Tell me about recent Google AI news",
      output:
        '{"strategy": "web_search", "queries": ["Google AI news 2025", "Google Gemini latest updates"]}',
      children: [
        {
          id: "llm1",
          name: "llm.chat",
          kind: "LLM",
          model: "gpt-4o-mini",
          latency: "1.39s",
          status: "ok",
          input:
            '{"messages": [{"role": "system", "content": "You are a planning agent..."}, {"role": "user", "content": "Tell me about recent Google AI news"}]}',
          output:
            '{"strategy": "web_search", "queries": ["Google AI news 2025"]}',
        },
      ],
    },
    {
      id: "tool1",
      name: "tool.web_search",
      kind: "TOOL",
      latency: "1.48s",
      status: "ok",
      input: '{"query": "Google AI news 2025 latest developments"}',
      output:
        '{"results": [{"title": "Google Gemini 2.0 Released", "snippet": "Google has released Gemini 2.0..."}, {"title": "Project Astra Demo", "snippet": "Real-time AI assistant..."}]}',
    },
    {
      id: "guard",
      name: "pii_guard",
      kind: "GUARDRAIL",
      latency: "0.02s",
      status: "ok",
      input: '{ "text": "내 카드번호 1234-5678-..." }',
      output: '{ "triggered": true, "masked": "[REDACTED_CARD]" }',
    },
    {
      id: "reflection",
      name: "reflection (iteration 2)",
      kind: "CHAIN",
      latency: "13.26s",
      status: "ok",
      input:
        "Synthesize search results into comprehensive answer about Google AI news",
      output:
        "Here are the latest Google AI developments:\n\n1. Gemini 2.0 — Google released Gemini 2.0...",
      children: [
        {
          id: "llm2",
          name: "llm.chat",
          kind: "LLM",
          model: "gpt-4o-mini",
          latency: "13.26s",
          status: "ok",
          input:
            '{"messages": [{"role": "system", "content": "You are a research synthesizer..."}, {"role": "user", "content": "Based on the search results, write a comprehensive answer..."}]}',
          output:
            "Here are the latest Google AI developments:\n\n1. **Gemini 2.0** — Google released Gemini 2.0 with enhanced multimodal capabilities...",
        },
      ],
    },
  ],
};

const KIND_STYLES: Record<string, { bg: string; fg: string; icon: string }> = {
  AGENT: { bg: "bg-foreground/10", fg: "text-foreground", icon: "A" },
  CHAIN: { bg: "bg-[#e3eafc] dark:bg-[#2e3a5b]", fg: "text-[#3555c4] dark:text-[#6b8cff]", icon: "C" },
  LLM: { bg: "bg-[#e8f5e9] dark:bg-[#2d4a2e]", fg: "text-[#2e7d32] dark:text-[#6fcf6f]", icon: "L" },
  TOOL: { bg: "bg-[#fef3e2] dark:bg-[#4a3b2d]", fg: "text-[#b57530] dark:text-[#e0a86b]", icon: "T" },
  RETRIEVER: { bg: "bg-[#fce4ec] dark:bg-[#4a2d3a]", fg: "text-[#b0446e] dark:text-[#e07baf]", icon: "R" },
  GUARDRAIL: { bg: "bg-[#ef4444]/10", fg: "text-[#ef4444]", icon: "G" },
};

/* ── Components ── */

function Badge({ name, label, score }: { name: string; label?: string; score?: number }) {
  const isScore = score !== undefined && label === undefined;
  const good = isScore ? score > 50 : label === "PASS";
  return (
    <span
      className={`inline-flex items-center rounded text-[9px] font-mono tabular-nums leading-none ${
        good ? "border border-foreground/15" : "border-2 border-foreground"
      }`}
    >
      <span className={`px-1.5 py-1 ${good ? "bg-foreground/5 text-foreground/50" : "bg-foreground/10 text-foreground font-semibold"}`}>
        {name}
      </span>
      {isScore ? (
        <span className={`px-1.5 py-1 font-bold ${good ? "bg-foreground/10 text-foreground/70" : "bg-foreground text-background"}`}>
          {score}%
        </span>
      ) : good ? (
        <span className="bg-foreground/10 px-1.5 py-1 font-bold text-foreground/70">
          PASS
        </span>
      ) : (
        <span className="bg-foreground px-1.5 py-1 font-bold text-background">
          FAIL
        </span>
      )}
    </span>
  );
}

function SpanNodeView({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: SpanNode;
  depth: number;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const style = KIND_STYLES[node.kind] || KIND_STYLES.CHAIN;
  const isSelected = selected === node.id;

  return (
    <div>
      <button
        onClick={() => onSelect(node.id)}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors ${
          isSelected ? "bg-accent" : "hover:bg-accent/50"
        }`}
        style={{ paddingLeft: depth * 24 + 8 }}
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold ${style.bg} ${style.fg}`}
        >
          {style.icon}
        </span>
        <span className="truncate text-xs font-medium">{node.name}</span>
        {node.model && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
            {node.model}
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {node.latency}
        </span>
      </button>
      {node.children?.map((child) => (
        <SpanNodeView
          key={child.id}
          node={child}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

/* ── Span Graph (visual node map like the real UI) ── */

interface GraphNode {
  id: string;
  name: string;
  kind: string;
  latency: string;
  x: number;
  y: number;
  children?: string[];
}

// NOTE: GUARDRAIL span(pii_guard)은 실제 SpanGraph와 동일하게 그래프에서 제외 — 트리·타임라인에만 표시.
const GRAPH_NODES: GraphNode[] = [
  { id: "root", name: "Agent.run", kind: "AGENT", latency: "16.1s", x: 210, y: 20, children: ["planning", "tool1", "reflection"] },
  { id: "planning", name: "planning", kind: "CHAIN", latency: "1.4s", x: 40, y: 130, children: ["llm1"] },
  { id: "tool1", name: "tool.web_sea...", kind: "TOOL", latency: "1.5s", x: 210, y: 130 },
  { id: "reflection", name: "reflection (...", kind: "CHAIN", latency: "13.3s", x: 380, y: 130, children: ["llm2"] },
  { id: "llm1", name: "llm.chat", kind: "LLM", latency: "1.4s", x: 40, y: 240 },
  { id: "llm2", name: "llm.chat", kind: "LLM", latency: "13.3s", x: 380, y: 240 },
];

const GRAPH_KIND_COLORS: Record<string, { border: string; iconBg: string; iconFg: string }> = {
  AGENT: { border: "border-[#171717]/30", iconBg: "bg-[#171717]", iconFg: "text-background" },
  CHAIN: { border: "border-[#2563eb]/30", iconBg: "bg-[#2563eb]", iconFg: "text-white" },
  LLM: { border: "border-[#059669]/30", iconBg: "bg-[#059669]", iconFg: "text-white" },
  TOOL: { border: "border-[#d97706]/30", iconBg: "bg-[#d97706]", iconFg: "text-white" },
  RETRIEVER: { border: "border-[#db2777]/30", iconBg: "bg-[#db2777]", iconFg: "text-white" },
  GUARDRAIL: { border: "border-[#ef4444]/30", iconBg: "bg-[#ef4444]", iconFg: "text-white" },
};

/* ── Timeline (root children latency proportions) ── */

const TIMELINE_SEGMENTS = [
  { id: "planning", name: "planning", label: "1.4s", seconds: 1.4, color: "bg-[#2563eb]" },
  { id: "tool1", name: "tool", label: "1.5s", seconds: 1.5, color: "bg-[#d97706]" },
  { id: "guard", name: "guard", label: "0.02s", seconds: 0.02, color: "bg-[#ef4444]" },
  { id: "reflection", name: "reflection", label: "13.3s", seconds: 13.3, color: "bg-[#2563eb]" },
];
const TIMELINE_TOTAL = TIMELINE_SEGMENTS.reduce((s, seg) => s + seg.seconds, 0);

function SpanGraph({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const nodeMap = Object.fromEntries(GRAPH_NODES.map((n) => [n.id, n]));
  const nodeW = 120;
  const nodeH = 60;

  return (
    <div className="relative" style={{ width: 540, height: 310 }}>
      {/* Lines (SVG) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {GRAPH_NODES.map((node) => (
          <Fragment key={node.id}>
            {(node.children ?? []).map((childId) => {
              const child = nodeMap[childId];
              if (!child) return null;
              return (
                <line
                  key={`${node.id}-${childId}`}
                  x1={node.x + nodeW / 2}
                  y1={node.y + nodeH}
                  x2={child.x + nodeW / 2}
                  y2={child.y}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              );
            })}
          </Fragment>
        ))}
      </svg>

      {/* Nodes */}
      {GRAPH_NODES.map((node) => {
        const colors = GRAPH_KIND_COLORS[node.kind] || GRAPH_KIND_COLORS.CHAIN;
        const isSelected = selected === node.id;
        return (
          <button
            key={node.id}
            onClick={() => onSelect(node.id)}
            className={`absolute flex flex-col items-center rounded-lg border bg-card px-3 py-2 transition-shadow ${colors.border} ${
              isSelected ? "shadow-md ring-1 ring-foreground/20" : "hover:shadow-sm"
            }`}
            style={{ left: node.x, top: node.y, width: nodeW, height: nodeH }}
          >
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${colors.iconBg} ${colors.iconFg}`}>
              {(KIND_STYLES[node.kind] || KIND_STYLES.CHAIN).icon}
            </span>
            <span className="text-[10px] font-medium mt-1 truncate w-full text-center">
              {node.name}
            </span>
            <span className="text-[8px] text-muted-foreground tabular-nums">
              {node.latency}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TracePreview() {
  const [selectedSpan, setSelectedSpan] = useState("root");
  const [tab, setTab] = useState<"input" | "output" | "evals">("input");
  // graph always visible below tree

  const findSpan = (node: SpanNode, id: string): SpanNode | null => {
    if (node.id === id) return node;
    for (const c of node.children ?? []) {
      const found = findSpan(c, id);
      if (found) return found;
    }
    return null;
  };

  const span = findSpan(MOCK_SPANS, selectedSpan) ?? MOCK_SPANS;
  const style = KIND_STYLES[span.kind] || KIND_STYLES.CHAIN;

  return (
    <div className="rounded-xl border overflow-hidden bg-background">
      {/* Trace header */}
      <div className="border-b bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold">Agent.run</span>
          <span className="text-xs text-muted-foreground">
            — Tell me about recent Google AI news
          </span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-muted-foreground">
            May 17, 12:41:58 AM
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MOCK_ANNOTATIONS.map((a) => (
            <Badge key={a.name} {...a} />
          ))}
        </div>
      </div>

      {/* Timeline bar — root children latency proportions */}
      <div className="border-b px-4 py-3">
        <div className="flex h-2 rounded overflow-hidden">
          {TIMELINE_SEGMENTS.map((seg) => (
            <div
              key={seg.id}
              className={seg.color}
              style={{ width: `${(seg.seconds / TIMELINE_TOTAL) * 100}%` }}
              title={`${seg.name} ${seg.label}`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {TIMELINE_SEGMENTS.map((seg) => (
            <span key={seg.id} className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <span className={`h-2 w-2 rounded-sm ${seg.color}`} />
              {seg.name} {seg.label}
            </span>
          ))}
        </div>
      </div>

      {/* Trace body: span tree + detail */}
      <div className="flex" style={{ minHeight: 320 }}>
        {/* Left: span tree */}
        <div className="w-[280px] shrink-0 border-r overflow-y-auto p-2">
          <SpanNodeView
            node={MOCK_SPANS}
            depth={0}
            selected={selectedSpan}
            onSelect={(id) => {
              setSelectedSpan(id);
              setTab("input");
            }}
          />
        </div>

        {/* Right: span detail */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Detail header */}
          <div className="border-b px-4 py-2.5 flex items-center gap-2">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold ${style.bg} ${style.fg}`}
            >
              {style.icon}
            </span>
            <span className="text-xs font-semibold">{span.name}</span>
            {span.model && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                {span.model}
              </span>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
              {span.latency}
            </span>
            {span.tokens && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {span.tokens}
              </span>
            )}
          </div>

          {/* Annotation badges for selected span */}
          {selectedSpan === "root" && (
            <div className="border-b px-4 py-2 flex flex-wrap gap-1.5">
              {MOCK_ANNOTATIONS.map((a) => (
                <Badge key={a.name} {...a} />
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b">
            {(["input", "output", "evals"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  tab === t
                    ? "border-b-2 border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "evals" ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-medium">Eval</th>
                    <th className="pb-2 font-medium">AI</th>
                    <th className="pb-2 font-medium text-right">Human</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {MOCK_ANNOTATIONS.map((a, i) => (
                    <tr key={a.name}>
                      <td className="py-2 font-mono text-muted-foreground">{a.name}</td>
                      <td className="py-2">
                        <Badge {...a} />
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">
                        {i % 2 === 0 ? "PASS" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <pre className="whitespace-pre-wrap break-words text-xs font-mono text-muted-foreground leading-relaxed">
                {tab === "input" ? span.input : span.output}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* Graph — always visible below */}
      <div className="border-t flex items-center justify-center p-6 overflow-x-auto">
        <SpanGraph
          selected={selectedSpan}
          onSelect={(id) => {
            setSelectedSpan(id);
            setTab("input");
          }}
        />
      </div>
    </div>
  );
}

/* ── Main ── */

export function PhoenixTracing() {
  const t = useT();
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        {t.docs.tracing.groupLabel}
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">{t.docs.tracing.title}</h1>
      <p className="text-sm text-muted-foreground mb-10">
        {t.docs.tracing.subtitle}
      </p>

      <div className="space-y-10">
        {/* Interactive trace preview */}
        <div>
          <h3 className="text-sm font-semibold mb-4">
            {t.docs.tracing.exampleTrace}
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            {t.docs.tracing.exampleTraceHelper}
          </p>
          <TracePreview />
        </div>

        {/* What is captured */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.tracing.whatCaptured}</h3>
          <DocTable
            headers={["Field", "Description", "Example"]}
            rows={[
              ["Latency", "End-to-end duration of each span", "1.23s"],
              ["Status", "OK or ERROR for each operation", "OK"],
              ["Model", "Which LLM model was called", "gpt-4o"],
              ["Prompt tokens", "Input tokens sent to the model", "1,245"],
              ["Completion tokens", "Output tokens from the model", "387"],
              ["Input / Output", "Full request and response payloads", '{ messages: [...] }'],
              ["Span kind", "Type of operation (LLM, CHAIN, RETRIEVER, TOOL)", "LLM"],
              ["Metadata", "Custom attributes attached to spans", 'user_id: "abc"'],
            ]}
          />
        </div>

        {/* Trace structure */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.tracing.traceStructure}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t.docs.tracing.traceStructureDesc}
          </p>
        </div>

        {/* Supported frameworks */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.tracing.supportedFrameworks}</h3>
          <DocTable
            headers={["Framework", "Instrumentor package"]}
            rows={[
              [
                "OpenAI",
                <code key="openai" className="text-xs font-mono text-muted-foreground">openinference-instrumentation-openai</code>,
              ],
              [
                "LangChain",
                <code key="lc" className="text-xs font-mono text-muted-foreground">openinference-instrumentation-langchain</code>,
              ],
              [
                "LlamaIndex",
                <code key="li" className="text-xs font-mono text-muted-foreground">openinference-instrumentation-llama-index</code>,
              ],
              [
                "Anthropic",
                <code key="an" className="text-xs font-mono text-muted-foreground">openinference-instrumentation-anthropic</code>,
              ],
              [
                "Custom",
                <code key="cu" className="text-xs font-mono text-muted-foreground">opentelemetry-sdk (manual spans)</code>,
              ],
            ]}
          />
        </div>

        {/* Framework examples */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.tracing.frameworkExamples}</h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                OpenAI
              </p>
              <CodeBlock
                filename="openai_agent.py"
                code={`from openinference.instrumentation.openai import OpenAIInstrumentor
from openai import OpenAI

OpenAIInstrumentor().instrument()
client = OpenAI()

# Every call is automatically traced
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)`}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                LangChain
              </p>
              <CodeBlock
                filename="langchain_agent.py"
                code={`from openinference.instrumentation.langchain import LangChainInstrumentor
from langchain_openai import ChatOpenAI

LangChainInstrumentor().instrument()
llm = ChatOpenAI(model="gpt-4o")

# Chain calls, tool usage, retrieval — all traced
response = llm.invoke("Summarize this document.")`}
              />
            </div>
          </div>
        </div>

        <Callout title={t.docs.tracing.calloutTitle}>
          {t.docs.tracing.calloutText}
        </Callout>
        <p className="text-xs text-muted-foreground">
          {t.docs.tracing.setupLink}
        </p>
      </div>
    </div>
  );
}
