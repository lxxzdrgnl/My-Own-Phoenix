"use client";

import { useState, useCallback } from "react";
import { RefreshCw, Filter, Play, Pencil, Inbox, ChevronDown, X, Plus, Trash2 } from "lucide-react";
import { Callout } from "../code-block";

/* ── Mock data ── */
const MOCK_TRACES = [
  {
    id: "t1",
    query: "Tell me about recent Google AI news",
    date: "May 17, 12:41",
    annotations: [
      { name: "RAG", score: 90, pass: true },
      { name: "CIT", score: 70, pass: true },
      { name: "HAL", score: 50, pass: true },
      { name: "GRD", label: "PASS", pass: true },
      { name: "TOOL", score: 100, pass: true },
      { name: "QA", label: "PASS", pass: true },
      { name: "BAN", label: "PASS", pass: true },
    ],
  },
  {
    id: "t2",
    query: "Samsung latest news summary",
    date: "May 17, 12:38",
    annotations: [
      { name: "RAG", score: 80, pass: true },
      { name: "CIT", score: 100, pass: true },
      { name: "HAL", score: 80, pass: true },
      { name: "GRD", label: "PASS", pass: true },
      { name: "TOOL", score: 100, pass: true },
      { name: "QA", label: "PASS", pass: true },
      { name: "BAN", label: "PASS", pass: true },
    ],
  },
  {
    id: "t3",
    query: "Latest Tesla trends update",
    date: "May 17, 12:19",
    annotations: [
      { name: "GRD", label: "PASS", pass: true },
      { name: "TOOL", score: 100, pass: true },
      { name: "QA", label: "PASS", pass: true },
      { name: "BAN", label: "PASS", pass: true },
    ],
  },
  {
    id: "t4",
    query: "Test question",
    date: "May 17, 12:12",
    annotations: [
      { name: "GRD", label: "PASS", pass: true },
      { name: "QA", label: "PASS", pass: true },
      { name: "BAN", label: "PASS", pass: true },
    ],
  },
  {
    id: "t5",
    query: "search about nvidia",
    date: "May 17, 12:01",
    annotations: [{ name: "BAN", label: "PASS", pass: true }],
  },
];

const ORIGINAL_RESULT = `Here are some recent AI-related news highlights from Google:

1. **Gemini Intelligence for Android** (May 12, 2026):
 - Introduces features like automating tasks, summarizing web content, and simplifying form filling.
 - Rolling out on select Samsung and Google phones this summer.

2. **Introducing Googlebook** (May 12, 2026):
 - A new category of laptops built for Gemini Intelligence, featuring a "Magic Pointer" for contextual suggestions.

3. **Gemini in Chrome** (May 12, 2026):
 - New features will help users summarize articles and automate tasks from the browser.`;

const MOCK_RESULTS: Record<string, string[]> = {
  t1: [
    `Based on the provided context, here is a structured summary of recent Google AI developments:\n\n**Key Announcements:**\n- Gemini Intelligence integration across Android, Chrome, and new hardware\n- "Magic Pointer" contextual AI on Googlebook laptops\n- Rambler voice-to-text feature for natural dictation\n\n**Impact Assessment:** These updates signal Google's shift toward ambient AI assistance embedded in everyday devices rather than standalone chatbot experiences.\n\n**Sources:** Google I/O 2026 keynote, official Android blog`,
    `**Summary of Recent Google AI News**\n\nGoogle announced several AI initiatives at I/O 2026:\n\n1. Gemini Intelligence — a suite of on-device AI features for Android phones\n2. Googlebook — AI-native laptop hardware with contextual suggestions\n3. Chrome AI — browser-integrated summarization and task automation\n\nThese represent a platform-wide AI integration strategy targeting consumer productivity.`,
  ],
  t2: [
    `**Samsung AI Update Summary:**\n\nSamsung has been actively expanding its AI capabilities across its product lineup:\n\n- Galaxy AI features expanded to mid-range devices (A-series)\n- Partnership with Google for on-device Gemini Nano integration\n- New AI-powered camera features: scene optimization, object removal\n- Bixby overhaul with LLM backbone expected Q3 2026\n\n**Analysis:** Samsung is positioning itself as the primary hardware partner for Google's AI ambitions while maintaining its own AI identity through Bixby improvements.`,
    `Samsung's latest AI developments focus on three areas:\n\n1. **On-device AI** — Gemini Nano on flagship Galaxy devices\n2. **Camera Intelligence** — Real-time scene understanding and editing\n3. **Smart Home** — SmartThings AI hub for predictive automation\n\nThe company aims to differentiate through hardware-software integration rather than competing directly on foundation models.`,
  ],
  t3: [
    `**Tesla Trends Update:**\n\n- Full Self-Driving v13 achieving 99.7% intervention-free miles in testing\n- Optimus robot entering limited factory deployment\n- Energy division revenue up 67% YoY\n- Robotaxi service pilot expanding to Austin and Miami\n\n**Market Outlook:** Tesla's diversification beyond vehicles positions it as an AI and energy company, with automotive as one of multiple revenue streams.`,
    `Tesla's current trajectory centers on AI and automation:\n\n1. FSD v13 — near-autonomous driving with minimal human intervention\n2. Optimus — humanoid robot now performing repetitive factory tasks\n3. Robotaxi — pilot programs in 3 US cities\n\nThe company is transitioning from an automaker to a broader AI/robotics platform.`,
  ],
  t4: [
    `This is a test response demonstrating the prompt template processing. The query "Test question" was received and processed through the legal-rag-answer template with context-based structured response formatting.\n\n**Status:** Template functioning correctly.\n**Context:** No relevant context provided.\n**Response quality:** N/A (test query)`,
    `**Test Response**\n\nQuery received: "Test question"\nTemplate applied: legal-rag-answer / concise summary mode\nContext length: 0 chars\n\nNo substantive answer can be generated for a test query without relevant context.`,
  ],
  t5: [
    `**NVIDIA Recent Developments:**\n\n- Blackwell Ultra GPU architecture announced for H2 2026\n- CUDA 13 with native support for sparse attention patterns\n- NIM microservices platform adoption growing 3x QoQ\n- Jensen Huang keynote emphasized "physical AI" and robotics\n\n**Key Insight:** NVIDIA continues to dominate AI infrastructure while expanding into inference optimization and edge deployment through NIM.`,
    `NVIDIA highlights:\n\n1. **Blackwell Ultra** — next-gen GPU for AI training and inference\n2. **NIM Platform** — containerized AI model deployment growing rapidly\n3. **Robotics push** — Isaac platform for embodied AI development\n\nNVIDIA remains the picks-and-shovels play for the AI industry with expanding software moats.`,
  ],
};

/* ── Badge component matching real AnnotationBadge styles ── */
function Badge({ name, score, label, pass }: { name: string; score?: number; label?: string; pass?: boolean }) {
  const isPass = pass ?? (score !== undefined && score >= 50);
  return (
    <span className={`inline-flex items-center rounded text-[9px] font-mono tabular-nums leading-none ${isPass ? "border border-foreground/15" : "border-2 border-foreground"}`}>
      <span className={`flex items-center gap-0.5 px-1.5 py-1 ${isPass ? "bg-foreground/5 text-foreground/50" : "bg-foreground/10 text-foreground font-semibold"}`}>
        {name}
      </span>
      {score !== undefined ? (
        <span className={`px-1.5 py-1 font-bold ${isPass ? "bg-foreground/10 text-foreground/70" : "bg-foreground text-background"}`}>
          {score}%
        </span>
      ) : (
        <span className={isPass ? "bg-foreground/10 px-1.5 py-1 font-bold text-foreground/70" : "bg-foreground px-1.5 py-1 font-bold text-background"}>
          {label ?? "PASS"}
        </span>
      )}
    </span>
  );
}

/* ── Column type ── */
interface ColumnState {
  id: number;
  label: string;
  promptLabel: string;
  running: boolean;
  result: string | null;
  contextOpen: boolean;
}

const PROMPT_OPTIONS = [
  "legal-rag-answer / v4 — structured response",
  "legal-rag-answer / v4 — concise summary",
  "legal-rag-answer / v3 — bullet points",
  "news-summarizer / v2 — key takeaways",
  "qa-responder / v1 — brief answer",
];

/* ── Playground Preview ── */
function PlaygroundPreview() {
  const [selectedId, setSelectedId] = useState("t1");
  const selected = MOCK_TRACES.find((t) => t.id === selectedId)!;
  const [contextOpen, setContextOpen] = useState(false);
  const [nextId, setNextId] = useState(3);
  const [columns, setColumns] = useState<ColumnState[]>([
    { id: 1, label: "Prompt 1", promptLabel: PROMPT_OPTIONS[0], running: false, result: null, contextOpen: false },
    { id: 2, label: "Prompt 2", promptLabel: PROMPT_OPTIONS[1], running: false, result: null, contextOpen: false },
  ]);

  const generateMockResult = useCallback((colIndex: number, traceId: string): string => {
    const results = MOCK_RESULTS[traceId] || MOCK_RESULTS["t1"];
    if (colIndex < results.length) return results[colIndex];
    // Generate a synthetic result for additional columns
    const query = MOCK_TRACES.find((t) => t.id === traceId)?.query || "query";
    return `**Generated Response (Column ${colIndex + 1})**\n\nBased on the query "${query}", here is an alternative perspective:\n\n- This response was generated using a different prompt template\n- The output structure and emphasis varies from other columns\n- Useful for comparing how different prompts handle the same input\n\n**Tokens used:** ${120 + colIndex * 30}`;
  }, []);

  const runColumn = useCallback((colId: number) => {
    setColumns((prev) => prev.map((c) =>
      c.id === colId ? { ...c, running: true, result: null } : c
    ));
    const colIndex = columns.findIndex((c) => c.id === colId);
    const delay = 1000 + Math.random() * 800;
    setTimeout(() => {
      setColumns((prev) => prev.map((c) =>
        c.id === colId ? { ...c, running: false, result: generateMockResult(colIndex, selectedId) } : c
      ));
    }, delay);
  }, [columns, selectedId, generateMockResult]);

  const runAll = useCallback(() => {
    columns.forEach((c) => runColumn(c.id));
  }, [columns, runColumn]);

  const addColumn = useCallback(() => {
    if (columns.length >= 6) return;
    const newCol: ColumnState = {
      id: nextId,
      label: `Prompt ${nextId}`,
      promptLabel: PROMPT_OPTIONS[Math.min(nextId - 1, PROMPT_OPTIONS.length - 1)],
      running: false,
      result: null,
      contextOpen: false,
    };
    setColumns((prev) => [...prev, newCol]);
    setNextId((n) => n + 1);
  }, [columns.length, nextId]);

  const removeColumn = useCallback((colId: number) => {
    setColumns((prev) => prev.filter((c) => c.id !== colId));
  }, []);

  const toggleColContext = useCallback((colId: number) => {
    setColumns((prev) => prev.map((c) =>
      c.id === colId ? { ...c, contextOpen: !c.contextOpen } : c
    ));
  }, []);

  // Reset results when trace changes
  const handleSelectTrace = (id: string) => {
    setSelectedId(id);
    setColumns((prev) => prev.map((c) => ({ ...c, result: null, running: false })));
  };

  const anyRunning = columns.some((c) => c.running);

  return (
    <div className="rounded-xl border overflow-hidden bg-background" style={{ height: 560 }}>
      <div className="flex h-full min-h-0">
        {/* ── LEFT: Trace sidebar ── */}
        <div className="w-[200px] shrink-0 flex flex-col border-r">
          <div className="border-b px-3 py-3">
            <div className="flex items-center gap-2">
              <button className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border bg-background transition hover:bg-accent">
                <RefreshCw className="h-3 w-3 text-muted-foreground" />
              </button>
              <button className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border bg-background transition hover:bg-accent">
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1 text-xs transition-colors hover:bg-accent">
                <Filter className="h-3 w-3" />
                Filter
                <span className="ml-1 rounded bg-foreground/10 px-1 text-[11px] tabular-nums">
                  {MOCK_TRACES.length}
                </span>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {MOCK_TRACES.map((t) => {
              const active = t.id === selectedId;
              return (
                <div
                  key={t.id}
                  onClick={() => handleSelectTrace(t.id)}
                  className={`group cursor-pointer border-b transition-colors hover:bg-accent/50 ${active ? "bg-accent font-medium" : "text-muted-foreground"}`}
                >
                  <div className="flex gap-2.5 px-3 py-2.5">
                    <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${active ? "bg-foreground" : "bg-transparent"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm leading-snug">{t.query}</p>
                      <time className="mt-1 text-xs tabular-nums text-muted-foreground">{t.date}</time>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.annotations.map((a) => (
                          <Badge key={a.name} {...a} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Scrollable columns area ── */}
        <div className="flex min-h-0 min-w-0 flex-1 overflow-x-auto">
        {/* ── ORIGINAL column ── */}
        <div className="flex flex-col border-r" style={{ flex: "1 0 200px", minWidth: 200 }}>
          <div className="shrink-0 border-b bg-muted/10 px-3 pt-3 pb-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Original
              </span>
              <div className="flex flex-wrap gap-1">
                {selected.annotations.slice(0, 4).map((a) => (
                  <Badge key={a.name} {...a} />
                ))}
              </div>
            </div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Query
            </label>
            <textarea
              value={selected.query}
              readOnly
              rows={2}
              className="w-full resize-none rounded-lg border bg-muted/20 px-2.5 py-1.5 text-sm leading-relaxed text-muted-foreground outline-none"
            />
            <div className="mt-1">
              <button
                onClick={() => setContextOpen(!contextOpen)}
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${contextOpen ? "rotate-180" : ""}`} />
                Context (4,003 chars)
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Result
            </span>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
              {ORIGINAL_RESULT}
            </p>
          </div>
        </div>

        {/* ── Dynamic prompt columns ── */}
        {columns.map((col) => (
          <div key={col.id} className="flex flex-col border-r" style={{ flex: "1 0 200px", minWidth: 200 }}>
            <div className="shrink-0 border-b bg-muted/5 px-3 pt-3 pb-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {col.label}
                </span>
                <div className="flex items-center gap-1">
                  <button className="flex items-center rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => removeColumn(col.id)}
                    className="flex items-center rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <select className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm outline-none">
                <option>{col.promptLabel}</option>
              </select>
              <div className="mt-2">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Query
                </label>
                <textarea
                  value={selected.query}
                  readOnly
                  rows={2}
                  className="w-full resize-none rounded-lg border bg-background px-2.5 py-1.5 text-sm leading-relaxed outline-none"
                />
              </div>
              <div className="mt-1">
                <button
                  onClick={() => toggleColContext(col.id)}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
                >
                  <ChevronDown className={`h-3 w-3 transition-transform ${col.contextOpen ? "rotate-180" : ""}`} />
                  Context (4,003 chars)
                </button>
              </div>
              <button
                onClick={() => runColumn(col.id)}
                disabled={col.running}
                className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-foreground text-sm font-medium text-background transition hover:bg-foreground/90 disabled:opacity-50"
              >
                {col.running ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )}
                {col.running ? "Running..." : "Run"}
              </button>
            </div>
            {/* Result area */}
            <div className="flex-1 overflow-y-auto">
              {col.running ? (
                <div className="flex items-center gap-2 px-3 py-6 text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Generating...</span>
                </div>
              ) : col.result ? (
                <div className="px-3 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Result
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {150 + col.id * 40} tokens
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{col.result}</p>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 opacity-20">
                  <Inbox className="h-6 w-6" />
                  <span className="text-xs">No result yet</span>
                </div>
              )}
            </div>
          </div>
        ))}

        </div>{/* close scrollable columns area */}

        {/* ── Right action bar ── */}
        <div className="flex shrink-0 flex-col items-center gap-3 border-l bg-muted/5 px-3 pt-3">
          <button
            onClick={addColumn}
            disabled={columns.length >= 6}
            className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
            title="Add prompt column"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={runAll}
            disabled={anyRunning}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background shadow-sm transition hover:bg-foreground/90 disabled:opacity-50"
            title="Run all columns"
          >
            <Play className="h-4 w-4 fill-current" />
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground" title="Manage prompts">
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main export ── */
export function Playground() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Features
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">Playground</h1>
      <p className="text-sm text-muted-foreground mb-10">
        Select existing traces, add up to 5-6 prompt variant columns, and
        compare results side-by-side. Test different prompts against the same
        inputs without re-running your full agent.
      </p>

      <div className="space-y-10">
        <div>
          <h3 className="text-sm font-semibold mb-3">Playground interface</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Click a trace on the left to load it. Press Run on each column or use the Play button on the right action bar to run all columns at once.
          </p>
          <PlaygroundPreview />
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3">Features</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              "Browse traces from any project with filters (span kind, annotations, latency)",
              "Add up to 5-6 prompt columns — each runs a different prompt variant for side-by-side comparison",
              "Run single column or all columns at once",
              "Edit prompts inline with template variable support ({query}, {context})",
              "Sync prompts from Phoenix prompt versions",
              "Add trace results to datasets for systematic testing",
              "Annotate spans directly from the playground",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/20" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <Callout title="Connector required for agent columns">
          Running prompt columns against your agent requires a connected
          agent via the Connector. You can still browse and compare existing
          trace results without a connector.
        </Callout>
      </div>
    </div>
  );
}
