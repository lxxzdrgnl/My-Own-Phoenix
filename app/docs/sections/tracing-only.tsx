import { CodeBlock, Callout } from "../code-block";

export function TracingOnly() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Guides
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">Tracing Only</h1>
      <p className="text-sm text-muted-foreground mb-10">
        Use My Own Phoenix purely for trace collection and monitoring — no agent
        connector, no local setup required.
      </p>

      <div className="space-y-10">
        {/* When to use */}
        <div>
          <h3 className="text-sm font-semibold mb-3">When to use this mode</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Tracing-only mode is for teams that have agents already deployed in
            production (or running locally) and want to monitor them without
            setting up the Agent Connector. You instrument your code, traces flow
            in, and you get full observability.
          </p>
          <div className="grid gap-px grid-cols-2 rounded-xl border overflow-hidden bg-border">
            <div className="bg-card p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-2">
                What you get
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {[
                  "Dashboard with metrics & charts",
                  "Trace viewer with span details",
                  "Automated evaluations (LLM & rule)",
                  "Cost & latency tracking",
                  "Team collaboration & roles",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-[10px]">✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-card p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-2">
                What you skip
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {[
                  "Agent Connector setup",
                  "Connector Key (pc_*)",
                  "Chat & Playground features",
                  "WebSocket relay connection",
                  "Dataset test runs on agent",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-[10px]">—</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Prerequisites */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Prerequisites</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You only need two things before instrumenting your code:
          </p>
          <ol className="mt-3 text-sm text-muted-foreground space-y-2 leading-relaxed">
            {[
              <>
                <strong className="text-foreground">A project</strong> — sign
                in with Google and create one from the Projects page (see Quick
                Start, steps 1-2)
              </>,
              <>
                <strong className="text-foreground">
                  Your Trace API Key
                </strong>{" "}
                (
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                  pt_*
                </code>
                ) — shown once at project creation. No Connector Key needed.
              </>,
            ].map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Setup */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Setup</h3>
          <CodeBlock
            filename="setup.sh"
            code={`# 1. Install the instrumentor for your framework
pip install arize-phoenix-otel openinference-instrumentation-openai

# 2. Set environment variables
export PHOENIX_API_KEY="pt_your_trace_key"
export PHOENIX_COLLECTOR_ENDPOINT="https://phoenix.rheon.kr/api/collect"

# 3. Run your agent — traces flow automatically
python agent.py`}
          />
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            The collector accepts both OTLP/HTTP transport encodings —{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">
              application/x-protobuf
            </code>{" "}
            (the OpenTelemetry SDK default) and{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">
              application/json
            </code>
            . No exporter configuration is required.
          </p>
        </div>

        {/* Framework examples */}
        <div>
          <h3 className="text-sm font-semibold mb-4">Framework examples</h3>

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

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Custom spans (manual)
              </p>
              <CodeBlock
                filename="custom_spans.py"
                code={`from opentelemetry import trace

tracer = trace.get_tracer("my-agent")

with tracer.start_as_current_span("agent_run") as span:
    span.set_attribute("agent.type", "custom")
    # your custom logic here
    with tracer.start_as_current_span("llm_call"):
        result = call_my_llm(prompt)
        span.set_attribute("llm.model", "gpt-4o")`}
              />
            </div>
          </div>
        </div>

        {/* Note */}
        <Callout title="Want interactive testing too?">
          If you later want to chat with your agent through the browser or run
          dataset tests, set up the{" "}
          <strong>Agent Connector</strong> — it takes under 5 minutes and does
          not require redeploying your agent.
        </Callout>
      </div>
    </div>
  );
}
