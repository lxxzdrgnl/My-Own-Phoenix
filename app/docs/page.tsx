"use client";

import { useState } from "react";
import { ArrowLeft, Copy, Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="group relative rounded-xl bg-[#0f0f17] p-5 font-mono text-[13px] text-[#c8ccd4] overflow-x-auto leading-relaxed">
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 rounded-md p-1.5 text-[#555] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[#999]"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre><code>{code}</code></pre>
    </div>
  );
}

const SECTIONS = [
  { id: "connector", label: "Agent Connector" },
  { id: "quickstart", label: "Quick Start" },
  { id: "trace", label: "Trace Collection" },
  { id: "projects", label: "Projects & Teams" },
  { id: "api", label: "API Reference" },
];

export default function DocsPage() {
  const [active, setActive] = useState("connector");

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-56 shrink-0 border-r bg-card p-5 flex flex-col">
        <button
          onClick={() => window.history.back()}
          className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </button>
        <h2 className="mb-1 text-sm font-bold tracking-tight">My Own Phoenix</h2>
        <p className="mb-4 text-[10px] text-muted-foreground">Documentation</p>
        <nav className="space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cn(
                "w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors",
                active === s.id
                  ? "bg-accent font-semibold"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t">
          <a
            href="/api/docs"
            target="_blank"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Swagger API
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="mx-auto max-w-3xl px-8 py-10">
          {active === "quickstart" && (
            <div>
              <h1 className="text-2xl font-bold tracking-tight mb-2">Quick Start</h1>
              <p className="text-sm text-muted-foreground mb-8">
                Get your first traces flowing in under 2 minutes.
              </p>

              <div className="space-y-8">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    Step 1 — Create a project
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Sign in and create a project. You will receive a Trace API Key (<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">pt_*</code>).
                  </p>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    Step 2 — Install the SDK
                  </h3>
                  <CodeBlock code="pip install arize-phoenix-otel openinference-instrumentation-openai" />
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    Step 3 — Add to your agent code
                  </h3>
                  <CodeBlock lang="python" code={`import os
from openinference.instrumentation.openai import OpenAIInstrumentor

os.environ["PHOENIX_API_KEY"] = "pt_your_key_here"
os.environ["PHOENIX_COLLECTOR_ENDPOINT"] = "https://your-app.com/api/collect"

OpenAIInstrumentor().instrument()

# Your existing agent code works as-is
# Traces are collected automatically`} />
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    Step 4 — Check your dashboard
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Run your agent. Traces appear in your project dashboard within seconds.
                  </p>
                </div>
              </div>
            </div>
          )}

          {active === "trace" && (
            <div>
              <h1 className="text-2xl font-bold tracking-tight mb-2">Trace Collection</h1>
              <p className="text-sm text-muted-foreground mb-8">
                How trace ingestion works and supported frameworks.
              </p>

              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-semibold mb-2">How it works</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Your agent sends traces via OpenTelemetry to <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">/api/collect</code>.
                    The endpoint validates your Trace API Key (<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">pt_*</code>),
                    identifies your project, and forwards the trace data to the Phoenix server.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Trace API Key</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                    Each project has a unique Trace Key. Find it in <strong>Project Settings → API Keys</strong>.
                    The key is shown once at creation — save it securely.
                  </p>
                  <CodeBlock code={`# Set as environment variable
export PHOENIX_API_KEY="pt_your_trace_key"
export PHOENIX_COLLECTOR_ENDPOINT="https://your-app.com/api/collect"

# Or in Python
import os
os.environ["PHOENIX_API_KEY"] = "pt_your_trace_key"
os.environ["PHOENIX_COLLECTOR_ENDPOINT"] = "https://your-app.com/api/collect"`} />
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Supported frameworks</h3>
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Framework</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Package</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {[
                          ["OpenAI", "openinference-instrumentation-openai"],
                          ["LangChain", "openinference-instrumentation-langchain"],
                          ["LlamaIndex", "openinference-instrumentation-llama-index"],
                          ["Anthropic", "openinference-instrumentation-anthropic"],
                          ["Custom", "opentelemetry-sdk (manual spans)"],
                        ].map(([fw, pkg]) => (
                          <tr key={fw}>
                            <td className="px-4 py-2.5 font-medium">{fw}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{pkg}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {active === "connector" && (
            <div>
              <h1 className="text-2xl font-bold tracking-tight mb-2">Agent Connector</h1>
              <p className="text-sm text-muted-foreground mb-8">
                Connect your local agent to the SaaS for Chat, Playground, and Dataset testing.
              </p>

              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Why use the connector?</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    The connector creates a WebSocket tunnel between your local agent and the SaaS.
                    This means you can test agents running on <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">localhost</code> through
                    the web UI — no public URL or deployment needed.
                  </p>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    Install
                  </h3>
                  <CodeBlock code="pip install phoenix-connector" />
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    Usage
                  </h3>
                  <CodeBlock code={`# Get your Connector Key from Global Settings
phoenix-connector \\
  --key=pc_your_connector_key \\
  --agent=http://localhost:2024 \\
  --project=my-project-slug \\
  --type=langgraph

# Output:
# ✓ Connected to SaaS
# ✓ Project: my-project
# ✓ Agent: http://localhost:2024
# ⏳ Waiting for requests...`} />
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Options</h3>
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Flag</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Default</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {[
                          ["--key", "Connector key (pc_*)", "required"],
                          ["--agent", "Local agent URL", "required"],
                          ["--project", "Project slug", "required"],
                          ["--type", "Agent type (langgraph | rest)", "langgraph"],
                          ["--assistant-id", "LangGraph assistant ID", "agent"],
                          ["--saas-url", "SaaS WebSocket URL", "wss://app.com"],
                        ].map(([flag, desc, def]) => (
                          <tr key={flag}>
                            <td className="px-4 py-2.5 font-mono text-xs">{flag}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{desc}</td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{def}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Connector Key</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Your Connector Key (<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">pc_*</code>) is personal.
                    Generate it in <strong>Global Settings → Connector Key</strong>.
                    Each team member has their own key.
                  </p>
                </div>
              </div>
            </div>
          )}

          {active === "projects" && (
            <div>
              <h1 className="text-2xl font-bold tracking-tight mb-2">Projects & Teams</h1>
              <p className="text-sm text-muted-foreground mb-8">
                How project-based access control works.
              </p>

              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Project model</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Every piece of data (traces, evaluations, datasets, chat threads) belongs to a project.
                    Access is controlled per-project — you can be in different teams for different projects.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Roles</h3>
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Role</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Permissions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        <tr>
                          <td className="px-4 py-2.5 font-medium">Owner</td>
                          <td className="px-4 py-2.5 text-muted-foreground">Everything + manage members + delete project + transfer ownership</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2.5 font-medium">Editor</td>
                          <td className="px-4 py-2.5 text-muted-foreground">Create/edit/delete data (evals, datasets, agents, chat)</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2.5 font-medium">Viewer</td>
                          <td className="px-4 py-2.5 text-muted-foreground">Read-only access to dashboard, traces, evaluations</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Inviting team members</h3>
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside leading-relaxed">
                    <li>Go to <strong>Project Settings → Members</strong></li>
                    <li>Click <strong>Generate Code</strong> — choose role and expiry</li>
                    <li>Share the code with your teammate</li>
                    <li>They enter it via <strong>Join Project</strong> on the homepage</li>
                    <li>You approve their request in the <strong>Pending Requests</strong> section</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {active === "api" && (
            <div>
              <h1 className="text-2xl font-bold tracking-tight mb-2">API Reference</h1>
              <p className="text-sm text-muted-foreground mb-8">
                Key API endpoints for programmatic access.
              </p>

              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-semibold mb-3">Endpoints</h3>
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Method</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Endpoint</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {[
                          ["POST", "/api/collect", "Ingest OTel traces (Bearer pt_*)"],
                          ["GET", "/api/projects", "List my projects"],
                          ["POST", "/api/projects", "Create a project"],
                          ["DELETE", "/api/projects", "Delete a project (owner)"],
                          ["POST", "/api/projects/join", "Join with invite code"],
                          ["GET", "/api/projects/:id/members", "List members"],
                          ["GET", "/api/connectors?projectId=", "List connectors"],
                          ["GET", "/api/health", "Health check (no auth)"],
                        ].map(([method, path, desc]) => (
                          <tr key={`${method}-${path}`}>
                            <td className="px-4 py-2.5">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${method === "GET" ? "bg-muted text-muted-foreground" : method === "POST" ? "bg-foreground/10 text-foreground" : "bg-destructive/10 text-destructive"}`}>
                                {method}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs">{path}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Authentication</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                    All API calls (except <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">/api/health</code> and{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">/api/collect</code>) require a Firebase ID token:
                  </p>
                  <CodeBlock code={`curl -H "Authorization: Bearer <firebase_id_token>" \\
  https://your-app.com/api/projects`} />
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    The <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">/api/collect</code> endpoint uses Trace API Keys instead:
                  </p>
                  <CodeBlock code={`curl -X POST \\
  -H "Authorization: Bearer pt_your_trace_key" \\
  -H "Content-Type: application/json" \\
  -d '{"resourceSpans": [...]}' \\
  https://your-app.com/api/collect`} />
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    For the full interactive API documentation, visit{" "}
                    <a href="/api/docs" target="_blank" className="font-medium text-foreground hover:underline">
                      Swagger UI →
                    </a>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
