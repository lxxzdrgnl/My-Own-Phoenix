import { Callout } from "../code-block";

const KEYS = [
  {
    name: "Trace API Key",
    prefix: "pt_*",
    purpose: "Authenticates trace data sent from your agent to a specific project",
    where: "Generated automatically when you create a new project",
    usedBy: "Your agent code (via PHOENIX_API_KEY env variable)",
    scope: "Per-project — each project has its own trace key",
    note: "Shown only once at project creation. Save it immediately.",
  },
  {
    name: "Connector Key",
    prefix: "pc_*",
    purpose: "Authenticates the WebSocket connection between your local agent and the platform",
    where: "Global Settings → Profile & Key → Generate Key",
    usedBy: "phoenix-connector CLI tool (--key flag)",
    scope: "Per-user — your personal key works across all your projects",
    note: "Required only if you want Chat, Playground, or Dataset testing.",
  },
  {
    name: "LLM Provider API Key",
    prefix: "sk-*, key-*, etc.",
    purpose: "Calls LLM models (OpenAI, Anthropic, Google, xAI) for evaluations and playground",
    where: "Global Settings → LLM Providers → Add Key",
    usedBy: "Platform's evaluation worker and playground features",
    scope: "Global (owner's keys) — auto-applied to all projects you own",
    note: "Project members can also add project-level keys in Project Settings → API Keys.",
  },
];

export function ApiKeys() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Getting Started
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">API Keys</h1>
      <p className="text-sm text-muted-foreground mb-10">
        My Own Phoenix uses three types of API keys. Each serves a different
        purpose.
      </p>

      <div className="space-y-6">
        {KEYS.map((k) => (
          <div key={k.name} className="rounded-xl border overflow-hidden">
            {/* header */}
            <div className="flex items-center gap-3 border-b bg-muted/20 px-5 py-3">
              <span className="text-sm font-semibold">{k.name}</span>
              <code className="rounded bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                {k.prefix}
              </code>
            </div>
            {/* body */}
            <div className="px-5 py-4 space-y-3 text-sm">
              <Row label="Purpose" value={k.purpose} />
              <Row label="Where to get" value={k.where} />
              <Row label="Used by" value={k.usedBy} />
              <Row label="Scope" value={k.scope} />
              {k.note && (
                <div className="mt-2">
                  <Callout>{k.note}</Callout>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Flow diagram */}
      <div className="mt-10">
        <h3 className="text-sm font-semibold mb-4">How keys are used</h3>
        <div className="flex items-stretch gap-2 text-center">
          <div className="flex-1 rounded-xl border p-4">
            <div className="text-xs font-semibold mb-1">Your Agent</div>
            <code className="text-[10px] text-muted-foreground font-mono">
              pt_* (Trace Key)
            </code>
            <div className="mt-2 text-[10px] text-muted-foreground">
              Sends traces
            </div>
          </div>
          <div className="flex items-center text-lg text-muted-foreground/30">
            &rarr;
          </div>
          <div className="flex-1 rounded-xl border p-4">
            <div className="text-xs font-semibold mb-1">Connector</div>
            <code className="text-[10px] text-muted-foreground font-mono">
              pc_* (Connector Key)
            </code>
            <div className="mt-2 text-[10px] text-muted-foreground">
              WebSocket relay
            </div>
          </div>
          <div className="flex items-center text-lg text-muted-foreground/30">
            &rarr;
          </div>
          <div className="flex-1 rounded-xl border p-4">
            <div className="text-xs font-semibold mb-1">Platform</div>
            <code className="text-[10px] text-muted-foreground font-mono">
              sk-* (LLM Key)
            </code>
            <div className="mt-2 text-[10px] text-muted-foreground">
              Runs evals &amp; playground
            </div>
          </div>
        </div>
      </div>

      {/* Tracing only vs Full */}
      <div className="mt-10">
        <h3 className="text-sm font-semibold mb-4">
          Which keys do I need?
        </h3>
        <div className="grid gap-px grid-cols-2 rounded-xl border overflow-hidden bg-border">
          <div className="bg-card p-5">
            <div className="text-xs font-semibold mb-2">Tracing Only</div>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="text-[10px]">&#10003;</span> Trace API Key
                (pt_*)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[10px]">&#10003;</span> LLM Provider Key
                (for auto-evaluations)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[10px]">&#8212;</span> Connector Key not
                needed
              </li>
            </ul>
          </div>
          <div className="bg-card p-5">
            <div className="text-xs font-semibold mb-2">
              Full (Chat + Playground + Datasets)
            </div>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="text-[10px]">&#10003;</span> Trace API Key
                (pt_*)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[10px]">&#10003;</span> LLM Provider Key
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[10px]">&#10003;</span> Connector Key
                (pc_*)
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-muted-foreground">{value}</span>
    </div>
  );
}
