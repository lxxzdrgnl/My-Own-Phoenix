import { CodeBlock, Callout, DocTable } from "../code-block";

export function Connector() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Guides
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">
        Agent Connector
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        Connect your local agent to the platform for Chat, Playground, and
        Dataset testing — no deployment required.
      </p>

      <div className="space-y-10">
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
              <div className="text-lg text-muted-foreground/30">→</div>
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
                  Global Settings → Profile & Key
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
                <strong className="text-foreground">Local agent running</strong>{" "}
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
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
            Install &amp; Run
          </h3>
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

        {/* Connector key callout */}
        <Callout title="Connector Key">
          Your Connector Key (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            pc_*
          </code>
          ) is personal. Each team member generates their own key in{" "}
          <strong>Global Settings → Profile & Key</strong>. If you lose it,
          click <strong>Regenerate</strong> to get a new one (the old key is
          invalidated).
        </Callout>
      </div>
    </div>
  );
}
