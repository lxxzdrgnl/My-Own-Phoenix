import { DocTable } from "../code-block";

export function PhoenixTracing() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Getting Started
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">
        Phoenix Tracing
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        Understand how OpenTelemetry-based trace collection works and what data
        is captured from your AI agents.
      </p>

      <div className="space-y-10">
        {/* What is tracing */}
        <div>
          <h3 className="text-sm font-semibold mb-3">What is tracing?</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Tracing captures the full lifecycle of every LLM call your agent
            makes — inputs, outputs, latency, token counts, and model metadata.
            It uses{" "}
            <strong className="text-foreground">OpenTelemetry (OTel)</strong>, the
            industry-standard observability framework, so you can instrument any
            Python agent with a few lines of code. No code changes to your agent
            logic required.
          </p>
        </div>

        {/* Architecture */}
        <div>
          <h3 className="text-sm font-semibold mb-4">Architecture</h3>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 rounded-xl border p-5 text-center">
              <div className="mb-2 flex justify-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/5 text-sm">
                  🤖
                </div>
              </div>
              <div className="text-xs font-semibold">Your Agent</div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                + OTel SDK
              </div>
            </div>
            <div className="flex items-center text-lg text-muted-foreground/30">
              →
            </div>
            <div className="flex-1 rounded-xl border p-5 text-center">
              <div className="mb-2 flex justify-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/5 text-sm">
                  🔑
                </div>
              </div>
              <div className="text-xs font-semibold">/api/collect</div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Key validation
              </div>
            </div>
            <div className="flex items-center text-lg text-muted-foreground/30">
              →
            </div>
            <div className="flex-1 rounded-xl border p-5 text-center">
              <div className="mb-2 flex justify-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/5 text-sm">
                  🔥
                </div>
              </div>
              <div className="text-xs font-semibold">Phoenix Server</div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Store &amp; analyze
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
            Your agent sends OTel spans to the{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
              /api/collect
            </code>{" "}
            endpoint. The endpoint validates your Trace API Key (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
              pt_*
            </code>
            ), identifies your project, and forwards the data to the Phoenix
            server for storage and analysis.
          </p>
        </div>

        {/* What is captured */}
        <div>
          <h3 className="text-sm font-semibold mb-4">What data is captured</h3>
          <DocTable
            headers={["Field", "Description", "Example"]}
            rows={[
              ["Latency", "End-to-end duration of each span", "1.23s"],
              ["Status", "OK or ERROR for each operation", "OK"],
              [
                "Model",
                "Which LLM model was called",
                "gpt-4o",
              ],
              [
                "Prompt tokens",
                "Input tokens sent to the model",
                "1,245",
              ],
              [
                "Completion tokens",
                "Output tokens from the model",
                "387",
              ],
              [
                "Input / Output",
                "Full request and response payloads",
                "{ messages: [...] }",
              ],
              [
                "Span kind",
                "Type of operation (LLM, CHAIN, RETRIEVER, TOOL)",
                "LLM",
              ],
              [
                "Metadata",
                "Custom attributes attached to spans",
                'user_id: "abc"',
              ],
            ]}
          />
        </div>

        {/* Trace structure */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Trace structure</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            A <strong className="text-foreground">trace</strong> represents one
            complete agent execution. Each trace contains multiple{" "}
            <strong className="text-foreground">spans</strong> — individual
            operations like LLM calls, tool invocations, or retrieval steps.
            Spans form a tree: parent spans contain child spans.
          </p>
          <div className="rounded-xl border p-5 font-mono text-xs text-muted-foreground space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-foreground/15" />
              <span className="text-foreground font-medium">Trace</span>
              <span className="text-[10px]">— agent_run (2.4s)</span>
            </div>
            <div className="flex items-center gap-2 pl-5">
              <div className="h-3 w-3 rounded-sm bg-foreground/10" />
              <span>├── LLM</span>
              <span className="text-[10px]">— gpt-4o (0.8s, 1,245 → 387 tokens)</span>
            </div>
            <div className="flex items-center gap-2 pl-5">
              <div className="h-3 w-3 rounded-sm bg-foreground/10" />
              <span>├── TOOL</span>
              <span className="text-[10px]">— search_docs (0.3s)</span>
            </div>
            <div className="flex items-center gap-2 pl-10">
              <div className="h-3 w-3 rounded-sm bg-foreground/5" />
              <span>└── RETRIEVER</span>
              <span className="text-[10px]">— vector_search (0.1s)</span>
            </div>
            <div className="flex items-center gap-2 pl-5">
              <div className="h-3 w-3 rounded-sm bg-foreground/10" />
              <span>└── LLM</span>
              <span className="text-[10px]">— gpt-4o (1.1s, 2,100 → 523 tokens)</span>
            </div>
          </div>
        </div>

        {/* Supported frameworks */}
        <div>
          <h3 className="text-sm font-semibold mb-4">Supported frameworks</h3>
          <DocTable
            headers={["Framework", "Instrumentor package"]}
            rows={[
              [
                "OpenAI",
                <code key="openai" className="text-xs font-mono text-muted-foreground">
                  openinference-instrumentation-openai
                </code>,
              ],
              [
                "LangChain",
                <code key="lc" className="text-xs font-mono text-muted-foreground">
                  openinference-instrumentation-langchain
                </code>,
              ],
              [
                "LlamaIndex",
                <code key="li" className="text-xs font-mono text-muted-foreground">
                  openinference-instrumentation-llama-index
                </code>,
              ],
              [
                "Anthropic",
                <code key="an" className="text-xs font-mono text-muted-foreground">
                  openinference-instrumentation-anthropic
                </code>,
              ],
              [
                "Custom",
                <code key="cu" className="text-xs font-mono text-muted-foreground">
                  opentelemetry-sdk (manual spans)
                </code>,
              ],
            ]}
          />
        </div>

        {/* Viewing traces */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Viewing traces</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Once traces are flowing, go to the <strong className="text-foreground">Projects</strong> page
            and select your project. You will see:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              "Live trace list with latency, status, and token counts",
              "Span detail view with full input/output payloads",
              "Latency and throughput charts over time",
              "Annotation scores from automated evaluations",
              "Cost estimates based on model and token usage",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/20" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
