"use client";

import { useState, useCallback } from "react";
import { RefreshCw, Filter, Play, Pencil, Inbox, ChevronDown, X, Plus, Trash2 } from "lucide-react";
import { Callout } from "../code-block";
import { useT } from "@/lib/i18n";

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
    // structured response
    `Based on the provided context, here is a structured summary of recent Google AI developments:\n\n**Key Announcements:**\n- Gemini Intelligence integration across Android, Chrome, and new hardware\n- "Magic Pointer" contextual AI on Googlebook laptops\n- Rambler voice-to-text feature for natural dictation\n\n**Impact Assessment:** These updates signal Google's shift toward ambient AI assistance embedded in everyday devices rather than standalone chatbot experiences.\n\n**Sources:** Google I/O 2026 keynote, official Android blog`,
    // concise summary
    `Google announced several AI initiatives at I/O 2026:\n\n1. Gemini Intelligence — on-device AI for Android\n2. Googlebook — AI-native laptop with contextual suggestions\n3. Chrome AI — browser summarization and task automation\n\nPlatform-wide AI integration strategy targeting consumer productivity.`,
    // key takeaways
    `**Key Takeaways — Google AI (May 2026)**\n\n• Gemini Intelligence rolls out to Samsung & Google phones this summer\n• Googlebook: new laptop category with "Magic Pointer" AI feature\n• Chrome gets AI summarization + task automation (late June)\n• Rambler: voice-to-polished-text dictation tool\n• Strategy: ambient AI in everyday devices, not standalone chatbots`,
    // brief answer
    `Google released Gemini Intelligence for Android, Googlebook laptops with AI features, and Chrome AI tools for summarization. All announced at I/O 2026, rolling out summer 2026.`,
    // investment memo
    `**Investment Memo: Google AI Strategy Update**\n\n**Thesis:** Google is embedding AI across its entire product stack (Android, Chrome, hardware), creating an ecosystem moat.\n\n**Key Signals:**\n- Gemini Intelligence: on-device AI reduces cloud dependency, improves margins\n- Googlebook: hardware play captures higher ASP, locks users into ecosystem\n- Chrome AI: browser integration reaches 3B+ users directly\n\n**Risk:** Execution across multiple product lines simultaneously. Samsung partnership dependency.\n\n**Rating:** Positive — strengthens platform dominance.`,
    // simple language
    `Google made some cool AI updates!\n\nBasically, your Android phone will get smarter — it can help you fill out forms, summarize websites, and turn your voice notes into clean text. They also made a new laptop called "Googlebook" that has a smart pointer that knows what you're looking at. And Chrome (the browser) will soon be able to summarize articles for you.\n\nAll of this is coming this summer.`,
  ],
  t2: [
    `**Samsung AI Update Summary:**\n\n- Galaxy AI features expanded to mid-range devices (A-series)\n- Partnership with Google for on-device Gemini Nano integration\n- New AI-powered camera features: scene optimization, object removal\n- Bixby overhaul with LLM backbone expected Q3 2026\n\n**Analysis:** Samsung is positioning itself as the primary hardware partner for Google's AI ambitions.`,
    `Samsung AI: Gemini Nano on Galaxy, AI camera features, Bixby LLM overhaul Q3 2026. Focus on hardware-software integration.`,
    `**Key Takeaways — Samsung AI**\n\n• Galaxy AI expanding to A-series (mid-range)\n• Gemini Nano partnership with Google\n• AI camera: scene optimization + object removal\n• Bixby getting LLM backbone Q3 2026\n• SmartThings AI hub for predictive home automation`,
    `Samsung is adding AI to Galaxy phones (Gemini Nano), cameras, and Bixby. Mid-range phones getting AI features too.`,
    `**Investment Memo: Samsung AI**\n\n**Thesis:** Samsung leverages Google partnership while maintaining own AI identity.\n**Signals:** Galaxy AI to mid-range = TAM expansion. Bixby LLM = differentiation.\n**Risk:** Over-dependence on Google's Gemini. Late to LLM race.\n**Rating:** Neutral — solid execution, limited upside vs. Apple.`,
    `Samsung is making their phones smarter! Even the cheaper Galaxy phones will get AI features now. The camera can automatically make your photos look better and remove things you don't want. And Bixby (Samsung's assistant) is getting a big upgrade to be more like ChatGPT.`,
  ],
  t3: [
    `**Tesla Trends Update:**\n\n- Full Self-Driving v13 achieving 99.7% intervention-free miles\n- Optimus robot entering limited factory deployment\n- Energy division revenue up 67% YoY\n- Robotaxi pilot expanding to Austin and Miami\n\n**Market Outlook:** Tesla is diversifying beyond vehicles into AI and energy.`,
    `Tesla: FSD v13 near-autonomous, Optimus in factories, Energy +67% YoY, Robotaxi expanding to 3 cities. Transitioning to AI/robotics platform.`,
    `**Key Takeaways — Tesla**\n\n• FSD v13: 99.7% intervention-free driving\n• Optimus robot: now in factory deployment\n• Energy revenue: +67% year-over-year\n• Robotaxi: Austin + Miami pilots\n• Shift from automaker → AI/energy company`,
    `Tesla's FSD v13 drives almost fully autonomously. Optimus robot is working in factories. Robotaxi launching in more cities.`,
    `**Investment Memo: Tesla**\n\n**Thesis:** Tesla is no longer just a car company — AI and energy are the growth vectors.\n**Signals:** FSD v13 near-production-ready, Robotaxi = recurring revenue, Energy +67% = diversification.\n**Risk:** Regulatory timeline for Robotaxi. Optimus still early.\n**Rating:** Positive — optionality on AI/robotics underpriced.`,
    `Tesla is doing way more than just cars now! Their self-driving software is getting really good (99.7% drives without human help). They have a robot called Optimus that's starting to work in factories. And their energy business (solar + batteries) grew 67% this year. They're also testing robot taxis in a few cities.`,
  ],
  t4: [
    `Test response processed through structured template.\n\n**Status:** Template functioning correctly.\n**Context:** No relevant context provided.\n**Response quality:** N/A (test query)`,
    `Test query received. No context provided. Template applied successfully.`,
    `**Key Takeaways:** Test query — no substantive content to summarize.`,
    `This is a test. No real content to answer.`,
    `**Memo:** Test query — no actionable data. N/A.`,
    `This was just a test question! Nothing to really answer here.`,
  ],
  t5: [
    `**NVIDIA Recent Developments:**\n\n- Blackwell Ultra GPU architecture announced for H2 2026\n- CUDA 13 with native sparse attention support\n- NIM microservices platform adoption growing 3x QoQ\n- Jensen Huang keynote: "physical AI" and robotics focus\n\n**Key Insight:** NVIDIA dominates AI infrastructure while expanding into inference optimization.`,
    `NVIDIA: Blackwell Ultra GPU (H2 2026), CUDA 13, NIM platform 3x growth. Expanding from training to inference and edge deployment.`,
    `**Key Takeaways — NVIDIA**\n\n• Blackwell Ultra: next-gen AI GPU, H2 2026\n• CUDA 13: native sparse attention patterns\n• NIM platform: 3x quarter-over-quarter adoption\n• Focus shift: "physical AI" + robotics\n• Isaac platform for embodied AI`,
    `NVIDIA announced Blackwell Ultra GPUs, CUDA 13, and NIM platform growing 3x. Focus on robotics and physical AI.`,
    `**Investment Memo: NVIDIA**\n\n**Thesis:** Picks-and-shovels play with expanding software moats.\n**Signals:** Blackwell Ultra = next cycle driver. NIM = software recurring revenue. Isaac = robotics TAM.\n**Risk:** Customer concentration (hyperscalers). China export restrictions.\n**Rating:** Strong Positive — monopoly position with software optionality.`,
    `NVIDIA makes the chips that power AI! They just announced even faster ones called "Blackwell Ultra" coming later this year. They also have a platform called NIM that makes it easy for companies to run AI, and it's growing really fast. The CEO Jensen Huang is also big on robots and "physical AI" — meaning AI that can interact with the real world.`,
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
  "news-summarizer / v2 — key takeaways",
  "qa-responder / v1 — brief answer",
  "analyst-report / v1 — investment memo",
  "eli5-explainer / v1 — simple language",
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
    <div className="rounded-xl border overflow-hidden bg-background" style={{ height: 520 }}>
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
  const t = useT();
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        {t.docs.playground.groupLabel}
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">{t.docs.playground.title}</h1>
      <p className="text-sm text-muted-foreground mb-10">
        {t.docs.playground.subtitle}
      </p>

      <div className="space-y-10">
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.playground.playgroundInterface}</h3>
          <p className="text-xs text-muted-foreground mb-3">
            {t.docs.playground.playgroundInterfaceHelper}
          </p>
          <PlaygroundPreview />
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.playground.features}</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {(t.docs.playground.featuresList as unknown as readonly string[]).map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/20" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <Callout title={t.docs.playground.calloutTitle}>
          {t.docs.playground.calloutText}
        </Callout>
      </div>
    </div>
  );
}
