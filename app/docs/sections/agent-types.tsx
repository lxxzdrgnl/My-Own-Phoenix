import { CodeBlock } from "../code-block";

export function AgentTypes() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Guides
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">
        Agent Types
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        The connector supports two agent types. Choose based on how your agent
        is built.
      </p>

      <div className="space-y-10">
        {/* Comparison */}
        <div>
          <h3 className="text-sm font-semibold mb-4">LangGraph vs REST</h3>
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
                <span className="shrink-0 font-medium text-foreground/70">
                  Endpoints
                </span>
                <div className="rounded-lg bg-muted/30 px-2.5 py-1.5 font-mono text-[10px]">
                  POST /threads
                </div>
                <div className="rounded-lg bg-muted/30 px-2.5 py-1.5 font-mono text-[10px]">
                  POST /threads/&#123;id&#125;/runs/stream
                </div>
                <p className="mt-2 text-[10px]">
                  Threads &amp; assistant ID managed automatically. Supports
                  streaming via SSE.
                </p>
              </div>
            </div>
            <div className="bg-card p-5">
              <div className="text-xs font-semibold mb-1">REST SSE</div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                Simple REST endpoint with Server-Sent Events. For custom agents
                that expose a{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">
                  /chat
                </code>{" "}
                route.
              </p>
              <div className="space-y-1.5 text-[11px] text-muted-foreground">
                <span className="shrink-0 font-medium text-foreground/70">
                  Endpoint
                </span>
                <div className="rounded-lg bg-muted/30 px-2.5 py-1.5 font-mono text-[10px]">
                  POST /chat
                </div>
                <p className="mt-2 text-[10px]">
                  Sends{" "}
                  <code className="font-mono">
                    &#123;messages, thread_id&#125;
                  </code>
                  . Expects SSE stream with{" "}
                  <code className="font-mono">content</code> or{" "}
                  <code className="font-mono">delta</code> fields.
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
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Create a LangGraph agent and run it with{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              langgraph dev
            </code>
            . The connector uses the LangGraph HTTP API automatically.
          </p>
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
          <h3 className="text-sm font-semibold mb-3">
            REST agent example
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            If you are building a custom agent (not LangGraph), implement a{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              POST /chat
            </code>{" "}
            endpoint that accepts messages and returns an SSE stream:
          </p>
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

        {/* REST request/response format */}
        <div>
          <h3 className="text-sm font-semibold mb-3">
            REST SSE request &amp; response format
          </h3>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Request body
          </p>
          <CodeBlock
            code={`{
  "messages": [
    {"role": "user", "content": "Hello!"},
    {"role": "assistant", "content": "Hi there!"},
    {"role": "user", "content": "What is 2+2?"}
  ],
  "thread_id": "optional-thread-id"
}`}
          />
          <p className="text-xs font-medium text-muted-foreground mt-4 mb-2">
            SSE response stream
          </p>
          <CodeBlock
            code={`data: {"content": "The"}
data: {"content": " answer"}
data: {"content": " is"}
data: {"content": " 4."}
data: [DONE]`}
          />
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            Each SSE event should contain a{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
              content
            </code>{" "}
            or{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
              delta
            </code>{" "}
            field with the text chunk. End the stream with{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
              data: [DONE]
            </code>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
