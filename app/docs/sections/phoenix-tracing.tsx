"use client";

import { CodeBlock, Callout, DocTable } from "../code-block";
import { useT } from "@/lib/i18n";
import { SpanTreeView } from "@/components/trace-tree";
import type { TraceTree, RawSpan, Annotation } from "@/lib/phoenix";

/* ── 실제 트레이싱 뷰(SpanTreeView)에 넣을 데모 트레이스 ──
   실제 컴포넌트를 그대로 쓰되 정적 mock 데이터만 주입한다 (백엔드 호출 없음). */

function mkSpan(p: Partial<RawSpan> & { spanId: string; name: string; spanKind: string }): RawSpan {
  return {
    traceId: "demo-trace-1",
    parentId: null,
    status: "OK",
    latency: 0,
    input: "",
    output: "",
    model: "",
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0,
    annotations: [],
    children: [],
    ...p,
  };
}
const ann = (name: string, label: string, score: number, kind: "LLM" | "HUMAN" = "LLM"): Annotation => ({
  name,
  label,
  score,
  annotatorKind: kind,
});

const NVDA_OUTPUT = `NVIDIA (NVDA) 정보:

**현재 주가:** $214.17
- **일일 변동:** +$1.57 (0.74%)

### 최근 뉴스
1. Sun Financial Inc, NVIDIA 주식 18,931주 매입.
2. NVIDIA 주가, 모든 시간 최고치에서 10% 하락.

### 재무 요약
| Period | Revenue | Net Inc | EPS  |
|--------|---------|---------|------|
| FY2026 | 215.9B  | 120.1B  | 4.93 |
| FY2025 | 130.5B  | 72.9B   | 2.97 |`;

const ROOT_ANNS: Annotation[] = [
  ann("fairness", "pass", 1),
  ann("legal_compliance", "partial", 0.5),
  ann("transparency", "partial", 0.5),
  ann("explainability", "pass", 1),
  ann("consumer_protection", "fail", 0),
  ann("bias", "pass", 1),
  ann("rag_relevance", "relevant", 0.8),
  ann("citation", "faithful", 1),
  ann("hallucination", "pass", 1),
  ann("guardrail", "passed", 1),
  ann("tool_calling", "appropriate", 1),
  ann("qa_correctness", "correct", 1),
  ann("banned_word", "clean", 1),
];

const ROOT: RawSpan = mkSpan({
  spanId: "root",
  name: "Agent.run",
  spanKind: "AGENT",
  latency: 15400,
  input: "nvidia에 대해 알려줘",
  output: NVDA_OUTPUT,
  promptTokens: 21679,
  completionTokens: 629,
  totalTokens: 22308,
  annotations: ROOT_ANNS,
  children: [
    mkSpan({
      spanId: "guard1",
      name: "pii_guard",
      spanKind: "GUARDRAIL",
      latency: 9800,
      guardrailTriggered: false,
      guardrailType: "pii_mask",
      input: '{ "text": "사용자 입력 검사" }',
      output: '{ "triggered": false }',
    }),
    mkSpan({
      spanId: "reflection",
      name: "reflection (iteration 2)",
      spanKind: "CHAIN",
      latency: 9800,
      input: "Synthesize search results into a comprehensive answer about NVIDIA",
      output: NVDA_OUTPUT,
      children: [
        mkSpan({
          spanId: "llm2",
          name: "llm.chat",
          spanKind: "LLM",
          model: "gpt-4o-mini",
          latency: 9800,
          promptTokens: 10525,
          completionTokens: 629,
          totalTokens: 11154,
          input: '{"messages":[{"role":"system","content":"You are a research synthesizer..."}]}',
          output: NVDA_OUTPUT,
        }),
      ],
    }),
    mkSpan({
      spanId: "tool_fin",
      name: "tool.get_financials",
      spanKind: "TOOL",
      latency: 2600,
      input: '{ "ticker": "NVDA" }',
      output: '{ "revenue": "215.9B", "net_income": "120.1B", "eps": 4.93 }',
    }),
    mkSpan({
      spanId: "tool_mkt",
      name: "tool.get_market_data",
      spanKind: "TOOL",
      latency: 2400,
      input: '{ "ticker": "NVDA" }',
      output: '{ "price": 214.17, "change_pct": 0.74 }',
      children: [
        mkSpan({
          spanId: "guard2",
          name: "pii_guard",
          spanKind: "GUARDRAIL",
          latency: 192,
          guardrailTriggered: false,
          guardrailType: "pii_mask",
          input: '{ "text": "도구 출력 검사" }',
          output: '{ "triggered": false }',
        }),
      ],
    }),
    mkSpan({
      spanId: "planning",
      name: "planning",
      spanKind: "CHAIN",
      latency: 3000,
      input: "Plan search strategy for: nvidia에 대해 알려줘",
      output: '{"strategy":"web_search","queries":["NVIDIA stock news","NVDA financials"]}',
      children: [
        mkSpan({
          spanId: "llm1",
          name: "llm.chat",
          spanKind: "LLM",
          model: "gpt-4o-mini",
          latency: 3000,
          promptTokens: 320,
          completionTokens: 48,
          totalTokens: 368,
          input: '{"messages":[{"role":"system","content":"You are a planning agent..."}]}',
          output: '{"strategy":"web_search"}',
        }),
      ],
    }),
  ],
});

const MOCK_TREES: TraceTree[] = [
  {
    traceId: "demo-trace-1",
    rootSpan: ROOT,
    spanCount: 9,
    latency: 15400,
    time: "2026-05-29T17:25:20.000Z",
  },
];

/* ── Main ── */

export function PhoenixTracing() {
  const t = useT();
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        {t.docs.tracing.groupLabel}
      </p>
      <h1 className="text-2xl tracking-tight mb-2" style={{ fontWeight: 700 }}>
        {t.docs.tracing.title}
      </h1>
      <p className="text-sm text-muted-foreground mb-10">{t.docs.tracing.subtitle}</p>

      <div className="space-y-10">
        {/* Interactive trace preview — 실제 SpanTreeView 사용 */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.tracing.exampleTrace}</h3>
          <p className="text-xs text-muted-foreground mb-3">{t.docs.tracing.exampleTraceHelper}</p>
          <SpanTreeView traces={MOCK_TREES} />
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
              ["Input / Output", "Full request and response payloads", "{ messages: [...] }"],
              ["Span kind", "Type of operation (LLM, CHAIN, RETRIEVER, TOOL, GUARDRAIL)", "LLM"],
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
              ["OpenAI", <code key="openai" className="text-xs font-mono text-muted-foreground">openinference-instrumentation-openai</code>],
              ["LangChain", <code key="lc" className="text-xs font-mono text-muted-foreground">openinference-instrumentation-langchain</code>],
              ["LlamaIndex", <code key="li" className="text-xs font-mono text-muted-foreground">openinference-instrumentation-llama-index</code>],
              ["Anthropic", <code key="an" className="text-xs font-mono text-muted-foreground">openinference-instrumentation-anthropic</code>],
              ["Custom", <code key="cu" className="text-xs font-mono text-muted-foreground">opentelemetry-sdk (manual spans)</code>],
            ]}
          />
        </div>

        {/* Framework examples */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.tracing.frameworkExamples}</h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">OpenAI</p>
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
              <p className="text-xs font-medium text-muted-foreground mb-2">LangChain</p>
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

        <Callout title={t.docs.tracing.calloutTitle}>{t.docs.tracing.calloutText}</Callout>
        <p className="text-xs text-muted-foreground">{t.docs.tracing.setupLink}</p>
      </div>
    </div>
  );
}
