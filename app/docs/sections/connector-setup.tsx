import { CodeBlock, Callout, DocTable } from "../code-block";

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
        deployment required.
      </p>

      <Callout title="Tracing works without a connector">
        If you only need trace collection and monitoring, skip this section.
        The connector is required only for interactive features (Chat,
        Playground, Dataset runs).
      </Callout>

      <div className="mt-10 space-y-10">
        {/* How it works */}
        <div>
          <h3 className="text-sm font-semibold mb-3">How it works</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            The connector creates a{" "}
            <strong className="text-foreground">
              reverse WebSocket tunnel
            </strong>{" "}
            between your local agent and the platform. Your agent stays on
            localhost — no public URL, no port forwarding needed.
          </p>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 rounded-xl border p-5">
              <div className="text-xs font-semibold mb-3">Your PC</div>
              <div className="space-y-2">
                <div className="rounded-lg bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                  Agent on localhost:2024
                </div>
                <div className="rounded-lg bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                  Connector (Python)
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-1 px-2">
              <div className="text-[10px] font-medium text-muted-foreground/50">
                WSS
              </div>
              <div className="text-lg text-muted-foreground/30">&rarr;</div>
              <div className="text-[10px] text-muted-foreground/40">
                outbound
              </div>
            </div>
            <div className="flex-1 rounded-xl border p-5">
              <div className="text-xs font-semibold mb-3">
                Server (phoenix.rheon.kr)
              </div>
              <div className="space-y-2">
                <div className="rounded-lg bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                  WebSocket Relay
                </div>
                <div className="rounded-lg bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                  Chat / Playground / Datasets
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Prerequisites */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Prerequisites</h3>
          <ol className="text-sm text-muted-foreground space-y-3 leading-relaxed">
            {[
              <>
                <strong className="text-foreground">Project created</strong> —
                you need a project first (see Quick Start)
              </>,
              <>
                <strong className="text-foreground">Connector Key</strong> — go
                to{" "}
                <strong className="text-foreground">
                  Global Settings &rarr; Profile &amp; Key
                </strong>{" "}
                and click{" "}
                <strong className="text-foreground">Generate Key</strong>. You
                will get a personal key (
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                  pc_*
                </code>
                ). Copy it — it is shown only once.
              </>,
              <>
                <strong className="text-foreground">
                  Local agent running
                </strong>{" "}
                — your agent must be serving HTTP on localhost (e.g.{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                  langgraph dev
                </code>{" "}
                on port 2024)
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
          <h3 className="text-sm font-semibold mb-3">Install &amp; Run</h3>
          <CodeBlock
            filename="terminal"
            code={`pip install phoenix-connector

phoenix-connector \\
  --key=pc_your_connector_key \\
  --agent=http://localhost:2024 \\
  --project=my-project-slug \\
  --type=langgraph

# Output:
# ✓ Connected to SaaS
# ✓ Project: my-project
# ✓ Agent: http://localhost:2024
# ⏳ Waiting for requests...`}
          />
        </div>

        {/* Options */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Options</h3>
          <DocTable
            headers={["Flag", "Description", "Default"]}
            rows={[
              [
                <code key="k" className="text-xs font-mono">--key</code>,
                "Connector key (pc_*)",
                "required",
              ],
              [
                <code key="a" className="text-xs font-mono">--agent</code>,
                "Local agent URL",
                "required",
              ],
              [
                <code key="p" className="text-xs font-mono">--project</code>,
                "Project slug",
                "required",
              ],
              [
                <code key="t" className="text-xs font-mono">--type</code>,
                "Agent type (langgraph | rest)",
                "langgraph",
              ],
              [
                <code key="ai" className="text-xs font-mono">--assistant-id</code>,
                "LangGraph assistant ID",
                "agent",
              ],
              [
                <code key="s" className="text-xs font-mono">--saas-url</code>,
                "Platform WebSocket URL",
                "wss://phoenix.rheon.kr",
              ],
            ]}
          />
        </div>

        {/* Agent Types */}
        <div>
          <h3 className="text-sm font-semibold mb-4">
            Agent Types: LangGraph vs REST
          </h3>
          <div className="grid gap-px grid-cols-2 rounded-xl border overflow-hidden bg-border">
            <div className="bg-card p-5">
              <div className="text-xs font-semibold mb-1">
                LangGraph{" "}
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  (default)
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                Uses the LangGraph SDK HTTP API. Best for agents built with{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">
                  langgraph dev
                </code>
                .
              </p>
              <div className="space-y-1.5 text-[11px] text-muted-foreground">
                <div className="rounded-lg bg-muted/30 px-2.5 py-1.5 font-mono text-[10px]">
                  POST /threads
                </div>
                <div className="rounded-lg bg-muted/30 px-2.5 py-1.5 font-mono text-[10px]">
                  POST /threads/&#123;id&#125;/runs/stream
                </div>
              </div>
            </div>
            <div className="bg-card p-5">
              <div className="text-xs font-semibold mb-1">REST SSE</div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                Simple REST endpoint with Server-Sent Events. For custom agents
                with a{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">
                  /chat
                </code>{" "}
                route.
              </p>
              <div className="space-y-1.5 text-[11px] text-muted-foreground">
                <div className="rounded-lg bg-muted/30 px-2.5 py-1.5 font-mono text-[10px]">
                  POST /chat
                </div>
                <p className="mt-2 text-[10px]">
                  Sends{" "}
                  <code className="font-mono">
                    &#123;messages, thread_id&#125;
                  </code>
                  . Expects SSE stream.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* LangGraph example */}
        <div>
          <h3 className="text-sm font-semibold mb-3">
            LangGraph agent example
          </h3>
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
              code={`# Start LangGraph dev server
langgraph dev --port 2024

# Connect to platform
phoenix-connector --key=pc_... --agent=http://localhost:2024 \\
  --project=my-project --type=langgraph`}
            />
          </div>
        </div>

        {/* REST example */}
        <div>
          <h3 className="text-sm font-semibold mb-3">REST agent example</h3>
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

    return StreamingResponse(generate(), media_type="text/event-stream")

# Run: uvicorn rest_agent:app --port 2024
# Connect: phoenix-connector --key=pc_... --agent=http://localhost:2024 \\
#           --project=my-project --type=rest`}
          />
        </div>

        {/* What's unlocked */}
        <Callout title="What the connector unlocks">
          Once connected, you can <strong>Chat</strong> with your agent in the
          browser, test prompts in the <strong>Playground</strong>, and run{" "}
          <strong>Dataset tests</strong> against your agent — all while it
          stays on your local machine.
        </Callout>
      </div>
    </div>
  );
}
