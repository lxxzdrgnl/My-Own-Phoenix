"use client";

import { useState } from "react";
import { CodeBlock, Callout, DocTable } from "../code-block";
import { useT } from "@/lib/i18n";

const ENV_CODE = `# 에이전트 .env
PHOENIX_COLLECTOR_ENDPOINT=https://phoenix.rheon.kr/api/collect
PHOENIX_API_KEY=pt_your_trace_key   # pt_ 키가 수신 프로젝트를 결정`;

const TS_CODE = `import { trace, context as otelContext } from "@opentelemetry/api";
import { OITracer } from "@arizeai/openinference-core";
import {
  SemanticConventions as SC,
  OpenInferenceSpanKind as Kind,
  MimeType,
} from "@arizeai/openinference-semantic-conventions";

const tracer = new OITracer({ tracer: trace.getTracer("dexter") });

async function run(query: string) {
  // AGENT span — 전체 실행을 감싼다
  const agent = tracer.startSpan("Agent.run", {
    attributes: {
      [SC.OPENINFERENCE_SPAN_KIND]: Kind.AGENT,
      [SC.INPUT_VALUE]: query,
    },
  });
  const agentCtx = trace.setSpan(otelContext.active(), agent);

  // CHAIN + LLM span — 반복마다 부모(agentCtx) 아래 중첩
  const chain = tracer.startSpan("planning",
    { attributes: { [SC.OPENINFERENCE_SPAN_KIND]: Kind.CHAIN } },
    agentCtx,
  );
  const chainCtx = trace.setSpan(agentCtx, chain);

  const llm = tracer.startSpan("llm.chat",
    { attributes: {
        [SC.OPENINFERENCE_SPAN_KIND]: Kind.LLM,
        [SC.LLM_MODEL_NAME]: "gpt-4o",
      } },
    chainCtx,
  );
  // ... 모델 호출 ...
  llm.setAttribute(SC.LLM_TOKEN_COUNT_TOTAL, 14918);
  llm.setAttribute(SC.OUTPUT_VALUE, answer);
  llm.end();
  chain.end();

  // TOOL span — 툴 호출마다
  const tool = tracer.startSpan("tool.web_search",
    { attributes: { [SC.OPENINFERENCE_SPAN_KIND]: Kind.TOOL } },
    agentCtx,
  );
  tool.end();

  agent.setAttribute(SC.OUTPUT_VALUE, answer);
  agent.end();
}`;

const PY_CODE = `from opentelemetry import trace
from openinference.semconv.trace import (
    SpanAttributes as SA,
    OpenInferenceSpanKindValues as Kind,
)

tracer = trace.get_tracer("dexter")

def run(query: str):
    # AGENT span — 전체 실행을 감싼다
    with tracer.start_as_current_span("Agent.run") as agent:
        agent.set_attribute(SA.OPENINFERENCE_SPAN_KIND, Kind.AGENT.value)
        agent.set_attribute(SA.INPUT_VALUE, query)

        # CHAIN + LLM span — with 블록 중첩이 부모-자식을 만든다
        with tracer.start_as_current_span("planning") as chain:
            chain.set_attribute(SA.OPENINFERENCE_SPAN_KIND, Kind.CHAIN.value)

            with tracer.start_as_current_span("llm.chat") as llm:
                llm.set_attribute(SA.OPENINFERENCE_SPAN_KIND, Kind.LLM.value)
                llm.set_attribute(SA.LLM_MODEL_NAME, "gpt-4o")
                # ... 모델 호출 ...
                llm.set_attribute(SA.LLM_TOKEN_COUNT_TOTAL, 14918)
                llm.set_attribute(SA.OUTPUT_VALUE, answer)

        # TOOL span — 툴 호출마다
        with tracer.start_as_current_span("tool.web_search") as tool:
            tool.set_attribute(SA.OPENINFERENCE_SPAN_KIND, Kind.TOOL.value)

        agent.set_attribute(SA.OUTPUT_VALUE, answer)`;

/* ── Main ── */

export function TracingSetup() {
  const t = useT();
  const [lang, setLang] = useState<"ts" | "py">("ts");

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        {t.docs.tracingSetup.groupLabel}
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">{t.docs.tracingSetup.title}</h1>
      <p className="text-sm text-muted-foreground mb-10">
        {t.docs.tracingSetup.subtitle}
      </p>

      <div className="space-y-10">
        {/* Connect */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.tracingSetup.connectHeading}</h3>
          <p className="text-xs text-muted-foreground mb-3">
            {t.docs.tracingSetup.connectHelper}
          </p>
          <CodeBlock filename="terminal" code={ENV_CODE} />
        </div>

        {/* Auto vs Manual */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.tracingSetup.autoVsManual}</h3>
          <div className="grid gap-px grid-cols-2 rounded-xl border overflow-hidden bg-border">
            <div className="bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-foreground text-background">AUTO</span>
                <span className="text-xs font-semibold">{t.docs.tracingSetup.autoLabel}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">{t.docs.tracingSetup.autoDesc}</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {(t.docs.tracingSetup.autoFeatures as unknown as readonly string[]).map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/20" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-muted text-muted-foreground">MANUAL</span>
                <span className="text-xs font-semibold">{t.docs.tracingSetup.manualLabel}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">{t.docs.tracingSetup.manualDesc}</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {(t.docs.tracingSetup.manualFeatures as unknown as readonly string[]).map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/20" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Manual span code + language tabs */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.tracingSetup.codeHeading}</h3>
          <p className="text-xs text-muted-foreground mb-3">
            {t.docs.tracingSetup.codeHelper}
          </p>
          <div className="flex border-b mb-3">
            {(["ts", "py"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  lang === l
                    ? "border-b-2 border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l === "ts" ? t.docs.tracingSetup.langTs : t.docs.tracingSetup.langPy}
              </button>
            ))}
          </div>
          <CodeBlock
            filename={lang === "ts" ? "agent.ts" : "agent.py"}
            code={lang === "ts" ? TS_CODE : PY_CODE}
          />
        </div>

        {/* Span kinds */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.tracingSetup.kindHeading}</h3>
          <DocTable
            headers={["Span kind", "OpenInference value"]}
            rows={[
              ["AGENT", <code key="a" className="text-xs font-mono text-muted-foreground">OpenInferenceSpanKind.AGENT</code>],
              ["CHAIN", <code key="c" className="text-xs font-mono text-muted-foreground">OpenInferenceSpanKind.CHAIN</code>],
              ["LLM", <code key="l" className="text-xs font-mono text-muted-foreground">OpenInferenceSpanKind.LLM</code>],
              ["TOOL", <code key="t" className="text-xs font-mono text-muted-foreground">OpenInferenceSpanKind.TOOL</code>],
              ["RETRIEVER", <code key="r" className="text-xs font-mono text-muted-foreground">OpenInferenceSpanKind.RETRIEVER</code>],
              ["GUARDRAIL", <code key="g" className="text-xs font-mono text-muted-foreground">OpenInferenceSpanKind.GUARDRAIL</code>],
            ]}
          />
        </div>

        {/* Tree description */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.tracingSetup.treeHeading}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t.docs.tracingSetup.treeDesc}
          </p>
        </div>

        <Callout title={t.docs.tracingSetup.calloutTitle}>
          {t.docs.tracingSetup.calloutText}
        </Callout>
      </div>
    </div>
  );
}
