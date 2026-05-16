import { CodeBlock, Callout } from "../code-block";

export function QuickStart() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Getting Started
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">
        Quick Start — Tracing
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        Instrument your AI agent and start collecting traces in under 2
        minutes. This guide covers{" "}
        <strong className="text-foreground">tracing only</strong> — monitoring
        your agent&apos;s LLM calls, latency, and token usage.
      </p>

      <Callout title="Looking for Chat & Playground?">
        If you want to interact with your agent through the browser (Chat,
        Playground, Dataset testing), you also need to set up the{" "}
        <strong>Agent Connector</strong>. See the{" "}
        <strong>Connector Setup</strong> section after completing this guide.
      </Callout>

      <div className="mt-10 space-y-8">
        {/* Step 1 */}
        <div className="flex gap-5">
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
              1
            </div>
            <div className="mt-2 w-px flex-1 bg-border" />
          </div>
          <div className="pb-8">
            <h3 className="text-sm font-semibold mb-2">
              Sign in with Google
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Go to{" "}
              <a
                href="/login"
                className="font-medium text-foreground hover:underline"
              >
                the login page
              </a>{" "}
              and click{" "}
              <strong className="text-foreground">
                Sign in with Google
              </strong>
              . No separate sign-up — your account is created automatically on
              first login.
            </p>
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex gap-5">
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
              2
            </div>
            <div className="mt-2 w-px flex-1 bg-border" />
          </div>
          <div className="pb-8">
            <h3 className="text-sm font-semibold mb-2">
              Create a project &amp; save your Trace Key
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              After login you land on the{" "}
              <strong className="text-foreground">Projects</strong> page.
            </p>
            <ol className="text-sm text-muted-foreground space-y-2 leading-relaxed">
              {[
                <>
                  Click{" "}
                  <strong className="text-foreground">New Project</strong> (top
                  right)
                </>,
                "Enter a project name (e.g. my-legal-rag) and click Create",
                <>
                  The response includes a{" "}
                  <strong className="text-foreground">Trace API Key</strong> (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                    pt_*
                  </code>
                  ) — <strong className="text-foreground">
                    copy it immediately
                  </strong>
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
            <Callout title="Trace Key is shown only once">
              The Trace API Key is displayed only at project creation. Save it in
              a secure location (e.g. .env file) before closing the dialog.
            </Callout>
          </div>
        </div>

        {/* Step 3 */}
        <div className="flex gap-5">
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
              3
            </div>
            <div className="mt-2 w-px flex-1 bg-border" />
          </div>
          <div className="flex-1 pb-8">
            <h3 className="text-sm font-semibold mb-3">Install the SDK</h3>
            <CodeBlock code="pip install arize-phoenix-otel openinference-instrumentation-openai" />
          </div>
        </div>

        {/* Step 4 */}
        <div className="flex gap-5">
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
              4
            </div>
            <div className="mt-2 w-px flex-1 bg-border" />
          </div>
          <div className="flex-1 pb-8">
            <h3 className="text-sm font-semibold mb-3">
              Add to your agent code
            </h3>
            <CodeBlock
              filename="agent.py"
              code={`import os
from openinference.instrumentation.openai import OpenAIInstrumentor

# Your Trace API Key — authenticates trace data to your project
os.environ["PHOENIX_API_KEY"] = "pt_your_key_here"
os.environ["PHOENIX_COLLECTOR_ENDPOINT"] = "https://phoenix.rheon.kr/api/collect"

# Auto-instrument all OpenAI calls
OpenAIInstrumentor().instrument()

# Your existing agent code works as-is
from openai import OpenAI
client = OpenAI()

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "What is quantum computing?"}]
)
print(response.choices[0].message.content)`}
            />
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              For LangChain, LlamaIndex, or other frameworks, see the{" "}
              <strong className="text-foreground">Tracing</strong> section for
              framework-specific examples.
            </p>
          </div>
        </div>

        {/* Step 5 */}
        <div className="flex gap-5">
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
              5
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold mb-2">
              Check your dashboard
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Run your agent. Go to your project dashboard — traces appear
              within seconds with latency, token usage, and model info.
              Automated evaluations (7 built-in templates) run automatically
              on every new trace.
            </p>
          </div>
        </div>

        {/* What's included */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-3">
            What you get with tracing
          </h3>
          <div className="grid gap-px grid-cols-2 rounded-xl border overflow-hidden bg-border">
            <div className="bg-card p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-2">
                Included
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {[
                  "Dashboard with metrics & charts",
                  "Trace viewer with span details",
                  "Automated evaluations (LLM & rule)",
                  "Cost & latency tracking",
                  "Team collaboration & roles",
                  "PII Guard",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-[10px]">&#10003;</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-card p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-2">
                Requires Connector
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {[
                  "Chat with your agent in browser",
                  "Playground (prompt experimentation)",
                  "Dataset test runs on agent",
                  "Real-time agent status",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-[10px]">&#8212;</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
