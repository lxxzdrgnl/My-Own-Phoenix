"use client";

import { useState } from "react";
import { CodeBlock, Callout, DocTable } from "../code-block";
import { cn } from "@/lib/utils";

// ─── Animated Architecture Diagram ─────────────────────────────────────

function ArchDiagram() {
  return (
    <div className="relative rounded-xl border bg-card p-6 overflow-hidden">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      <div className="relative flex items-center justify-between gap-4">
        {/* Local box */}
        <div className="flex-1 rounded-lg border border-border/60 bg-background p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex size-6 items-center justify-center rounded-md bg-foreground text-background text-[10px] font-bold">
              PC
            </div>
            <span className="text-xs font-semibold">Your Machine</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
              <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-mono text-muted-foreground">Agent :2024</span>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
              <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: "0.5s" }} />
              <span className="text-[11px] font-mono text-muted-foreground">Connector</span>
            </div>
          </div>
        </div>

        {/* Connection arrow */}
        <div className="flex flex-col items-center gap-1 shrink-0 px-2">
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">WSS</div>
          <div className="relative w-16 h-px">
            <div className="absolute inset-0 bg-border" />
            <div
              className="absolute top-0 h-full w-6 bg-foreground/20"
              style={{ animation: "slideRight 2s ease-in-out infinite" }}
            />
            {/* Arrowhead */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 border-4 border-transparent border-l-foreground/30" />
          </div>
          <div className="text-[8px] text-muted-foreground/30">outbound only</div>
        </div>

        {/* Server box */}
        <div className="flex-1 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex size-6 items-center justify-center rounded-md bg-foreground text-background text-[10px] font-bold">
              ☁
            </div>
            <span className="text-xs font-semibold">phoenix.rheon.kr</span>
          </div>
          <div className="space-y-1.5">
            <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] font-mono text-muted-foreground">
              WebSocket Relay
            </div>
            <div className="flex gap-1">
              {["Chat", "Playground", "Datasets"].map((f) => (
                <span key={f} className="rounded bg-foreground/5 px-2 py-1 text-[9px] font-medium text-muted-foreground">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideRight {
          0%, 100% { left: 0; opacity: 0; }
          50% { opacity: 1; }
          100% { left: calc(100% - 24px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Interactive CLI Preview ───────────────────────────────────────────

function CLIPreview() {
  const [mode, setMode] = useState<"interactive" | "flags">("interactive");

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-1 rounded-lg border p-0.5 w-fit">
        <button
          onClick={() => setMode("interactive")}
          className={cn(
            "rounded-md px-3 py-1 text-[11px] font-medium transition-colors",
            mode === "interactive" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Interactive
        </button>
        <button
          onClick={() => setMode("flags")}
          className={cn(
            "rounded-md px-3 py-1 text-[11px] font-medium transition-colors",
            mode === "flags" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          )}
        >
          With Flags
        </button>
      </div>

      {mode === "interactive" ? (
        <CodeBlock
          filename="terminal"
          code={`$ phoenix-connector

Phoenix Connector v0.1.1

  Connector key (pc_*): pc_your_key_here
  Agent URL [http://localhost:2024]:

  Agent type:
    1. langgraph
    2. rest
  Select: 1

  Assistant ID [agent]:

  Fetching projects...

  Available projects:
    1. my-project [owner]
    2. team-project [editor]
  Select project: 1
  → my-project

  Agent:   http://localhost:2024 (langgraph)
  Project: my-project

✓ Connected to SaaS
✓ Project: my-project
✓ Agent: http://localhost:2024
⏳ Waiting for requests...`}
        />
      ) : (
        <CodeBlock
          filename="terminal"
          code={`$ phoenix-connector \\
    --key=pc_your_key_here \\
    --agent=http://localhost:2024 \\
    --type=langgraph \\
    --project=my-project-slug

Phoenix Connector v0.1.1

  Agent:   http://localhost:2024 (langgraph)
  Project: my-project-slug

✓ Connected to SaaS
✓ Project: my-project
✓ Agent: http://localhost:2024
⏳ Waiting for requests...`}
        />
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────

export function ConnectorSetup() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Getting Started
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">
        Connector Setup
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        Connect your local agent to the platform for{" "}
        <strong className="text-foreground">Chat</strong>,{" "}
        <strong className="text-foreground">Playground</strong>, and{" "}
        <strong className="text-foreground">Dataset testing</strong> — no
        deployment required. If you only need trace collection and monitoring,
        skip this section — the connector is required only for interactive
        features.
      </p>

      <div className="space-y-10">
        {/* Architecture */}
        <div>
          <h3 className="text-sm font-semibold mb-4">How it works</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            The connector creates a{" "}
            <strong className="text-foreground">reverse WebSocket tunnel</strong>{" "}
            from your machine to the platform. Your agent stays on localhost —
            no public URL, no port forwarding, no firewall changes.
          </p>
          <ArchDiagram />
        </div>

        {/* Prerequisites */}
        <div>
          <h3 className="text-sm font-semibold mb-4">Prerequisites</h3>
          <ol className="text-sm text-muted-foreground space-y-3 leading-relaxed">
            {[
              <>
                <strong className="text-foreground">Create a project</strong> —
                Go to the Projects page and create a new project (or use an
                existing one).
              </>,
              <>
                <strong className="text-foreground">Get your Connector Key</strong> —
                Go to{" "}
                <strong className="text-foreground">
                  Global Settings → Profile &amp; Key
                </strong>{" "}
                and click Generate Key. You&apos;ll get a personal key (
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                  pc_*
                </code>
                ). Copy it — each team member has their own key.
              </>,
              <>
                <strong className="text-foreground">Start your agent</strong> —
                Your agent must be serving HTTP on localhost. For example:{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                  langgraph dev --port 2024
                </code>
              </>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Install & Run */}
        <div>
          <h3 className="text-sm font-semibold mb-4">Install &amp; Run</h3>
          <div className="mb-4">
            <CodeBlock filename="terminal" code="pip install phoenix-connector" />
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Toggle between interactive and flag-based modes to see both usage
            styles.
          </p>
          <CLIPreview />
        </div>

        {/* Options Table */}
        <div>
          <h3 className="text-sm font-semibold mb-4">CLI Options</h3>
          <p className="text-xs text-muted-foreground mb-3">
            All flags are optional — the CLI will prompt for any missing values interactively.
          </p>
          <DocTable
            headers={["Flag", "Description", "Default"]}
            rows={[
              [
                <code key="k" className="text-xs font-mono">--key</code>,
                "Connector key (pc_*)",
                <span key="kd" className="text-muted-foreground/60">prompts</span>,
              ],
              [
                <code key="a" className="text-xs font-mono">--agent</code>,
                "Local agent URL",
                <code key="ad" className="text-xs font-mono text-muted-foreground/60">localhost:2024</code>,
              ],
              [
                <code key="p" className="text-xs font-mono">--project</code>,
                "Project slug (omit to select from list)",
                <span key="pd" className="text-muted-foreground/60">selects</span>,
              ],
              [
                <code key="t" className="text-xs font-mono">--type</code>,
                "Agent type (langgraph | rest)",
                <code key="td" className="text-xs font-mono text-muted-foreground/60">langgraph</code>,
              ],
              [
                <code key="ai" className="text-xs font-mono">--assistant-id</code>,
                "LangGraph assistant ID",
                <code key="aid" className="text-xs font-mono text-muted-foreground/60">agent</code>,
              ],
              [
                <code key="s" className="text-xs font-mono">--saas-url</code>,
                "Platform WebSocket URL",
                <code key="sd" className="text-xs font-mono text-muted-foreground/60">wss://phoenix.rheon.kr</code>,
              ],
            ]}
          />
        </div>

        {/* Agent Types */}
        <div>
          <h3 className="text-sm font-semibold mb-4">Agent Types</h3>
          <div className="grid gap-3 grid-cols-2">
            <div className="rounded-xl border p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-foreground text-background text-[10px] font-bold">
                  LG
                </div>
                <span className="text-xs font-semibold">LangGraph</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">default</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                Uses the LangGraph SDK HTTP API. Best for agents built with{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">langgraph dev</code>.
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {["POST /threads", "POST /threads/{id}/runs/stream"].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/20" />
                    <code className="text-[10px] font-mono">{item}</code>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-foreground/10 text-foreground text-[10px] font-bold">
                  RS
                </div>
                <span className="text-xs font-semibold">REST SSE</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                Simple REST endpoint with Server-Sent Events. For custom agents with a{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">/chat</code> route.
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {[
                  "POST /chat",
                  "Body: {messages, thread_id} → SSE stream",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/20" />
                    <code className="text-[10px] font-mono">{item}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Code Examples */}
        <div>
          <h3 className="text-sm font-semibold mb-4">LangGraph Example</h3>
          <CodeBlock
            filename="agent.py"
            code={`from langgraph.graph import StateGraph, MessagesState, START, END
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o")

def call_model(state: MessagesState):
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

graph = StateGraph(MessagesState)
graph.add_node("model", call_model)
graph.add_edge(START, "model")
graph.add_edge("model", END)
agent = graph.compile()`}
          />
          <div className="mt-3">
            <CodeBlock
              filename="terminal"
              code={`langgraph dev --port 2024
phoenix-connector --key=pc_... --agent=http://localhost:2024`}
            />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-4">REST SSE Example</h3>
          <CodeBlock
            filename="rest_agent.py"
            code={`from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from openai import OpenAI
import json

app = FastAPI()
client = OpenAI()

@app.post("/chat")
async def chat(request: Request):
    body = await request.json()
    messages = body.get("messages", [])

    def generate():
        stream = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                yield f"data: {json.dumps({'content': delta})}\\n\\n"
        yield "data: [DONE]\\n\\n"

    return StreamingResponse(generate(), media_type="text/event-stream")`}
          />
          <div className="mt-3">
            <CodeBlock
              filename="terminal"
              code={`uvicorn rest_agent:app --port 2024
phoenix-connector --key=pc_... --agent=http://localhost:2024 --type=rest`}
            />
          </div>
        </div>

        <Callout title="What the connector unlocks">
          Once connected, you can <strong>Chat</strong> with your agent in the
          browser, test prompts in the <strong>Playground</strong>, and run{" "}
          <strong>Dataset evaluations</strong> against your agent — all while it
          stays on your local machine.
        </Callout>
      </div>
    </div>
  );
}
