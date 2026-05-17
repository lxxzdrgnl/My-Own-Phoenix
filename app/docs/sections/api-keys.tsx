"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Callout, CodeBlock } from "../code-block";
import { Key, Plug, Bot, Shield, Check, Minus } from "lucide-react";

// ─── Key Card ──────────────────────────────────────────────────────────

interface KeyInfo {
  icon: typeof Key;
  name: string;
  prefix: string;
  color: string;
  purpose: string;
  location: string;
  usedBy: string;
  scope: string;
  envVar?: string;
  note: string;
  steps: { action: string; detail: string }[];
}

const KEYS: KeyInfo[] = [
  {
    icon: Shield,
    name: "Trace Key",
    prefix: "pt_*",
    color: "bg-foreground",
    purpose: "Authenticates trace data sent from your agent to a specific project.",
    location: "Project Settings → API Keys → Generate Trace Key",
    usedBy: "Your agent code via PHOENIX_API_KEY environment variable.",
    scope: "Per-project — each project has its own trace key.",
    envVar: "PHOENIX_API_KEY",
    note: "The key is stored encrypted and always visible in Project Settings. Regenerating invalidates the old key.",
    steps: [
      { action: "Open your project", detail: "Click on the project from the Projects page" },
      { action: "Go to Project Settings", detail: "Click \"Project Settings\" in the sidebar" },
      { action: "Select API Keys tab", detail: "You'll see Trace Key and LLM Provider Keys sections" },
      { action: "Click Generate Trace Key", detail: "The key and .env setup guide will appear. Copy both." },
    ],
  },
  {
    icon: Plug,
    name: "Connector Key",
    prefix: "pc_*",
    color: "bg-foreground/80",
    purpose: "Authenticates the WebSocket connection between your local agent and the platform.",
    location: "Global Settings → Profile & Key → Generate Key",
    usedBy: "phoenix-connector CLI tool (--key flag or interactive prompt).",
    scope: "Per-user — your personal key works across all your projects.",
    envVar: undefined,
    note: "Required only for interactive features: Chat, Playground, Dataset testing. Not needed for trace-only monitoring.",
    steps: [
      { action: "Go to Global Settings", detail: "Click \"Global Settings\" in the sidebar or top bar" },
      { action: "Profile & Key tab", detail: "This is the default tab when you open settings" },
      { action: "Click Generate Key", detail: "Your personal connector key (pc_*) will appear" },
      { action: "Copy the key", detail: "Use it with phoenix-connector CLI or save it somewhere safe" },
    ],
  },
  {
    icon: Bot,
    name: "LLM Provider Key",
    prefix: "sk-*, key-*",
    color: "bg-foreground/60",
    purpose: "Calls LLM models (OpenAI, Anthropic, Google, xAI) for evaluations and playground.",
    location: "Global Settings → Providers, or Project Settings → API Keys",
    usedBy: "Platform's eval worker and playground features.",
    scope: "Global keys auto-copy to new projects. Project-level keys override globals.",
    envVar: undefined,
    note: "Project members with editor/owner role can add project-level keys that override the global ones.",
    steps: [
      { action: "Global key: Global Settings → Providers", detail: "Add your OpenAI/Anthropic/Google/xAI API key. Auto-applied to new projects." },
      { action: "Project key: Project Settings → API Keys", detail: "Add a project-specific key that overrides the global one for this project only." },
      { action: "Click Add Key next to provider", detail: "Paste your API key and click Save" },
    ],
  },
];

function KeyCard({ info, isActive, onClick }: { info: KeyInfo; isActive: boolean; onClick: () => void }) {
  const Icon = info.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-xl border px-4 py-3.5 text-left transition-all duration-150",
        isActive
          ? "border-foreground bg-foreground/[0.03] shadow-sm"
          : "border-border/60 hover:border-foreground/20 hover:bg-accent/20"
      )}
    >
      <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg text-background", info.color)}>
        <Icon className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{info.name}</span>
          <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{info.prefix}</code>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{info.scope}</p>
      </div>
      <div className={cn(
        "size-2 rounded-full shrink-0 transition-colors",
        isActive ? "bg-foreground" : "bg-transparent"
      )} />
    </button>
  );
}

// ─── Detail Panel ──────────────────────────────────────────────────────

function KeyDetail({ info }: { info: KeyInfo }) {
  const Icon = info.icon;
  return (
    <div className="rounded-xl border bg-muted/10 p-5 h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 pb-4 border-b">
        <div className={cn("flex size-10 items-center justify-center rounded-xl text-background", info.color)}>
          <Icon className="size-5" />
        </div>
        <div>
          <h4 className="text-base font-semibold tracking-tight">{info.name}</h4>
          <code className="text-[11px] font-mono text-muted-foreground">{info.prefix}</code>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        <DetailRow label="Purpose" value={info.purpose} />
        <DetailRow label="Where to get" value={info.location} />
        <DetailRow label="Used by" value={info.usedBy} />
        <DetailRow label="Scope" value={info.scope} />

        {/* Step-by-step guide */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            How to get it
          </span>
          <div className="mt-2 space-y-0">
            {info.steps.map((step, i) => (
              <div key={i} className="flex gap-3 pb-3">
                <div className="flex flex-col items-center">
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background text-[9px] font-bold">
                    {i + 1}
                  </div>
                  {i < info.steps.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                </div>
                <div className="pt-0.5">
                  <p className="text-[12px] font-medium leading-tight">{step.action}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {info.envVar && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Environment Variable
            </span>
            <div className="mt-1.5 rounded-lg bg-[#0f0f17] px-3.5 py-2">
              <code className="text-[12px] font-mono text-[#c3e88d]">{info.envVar}</code>
              <span className="text-[12px] font-mono text-[#546e7a]">=</span>
              <code className="text-[12px] font-mono text-[#c8ccd4]">{info.prefix.replace("*", "your_key_here")}</code>
            </div>
          </div>
        )}

        <div className="pt-1">
          <Callout>{info.note}</Callout>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
        {label}
      </span>
      <p className="text-[13px] text-muted-foreground leading-relaxed mt-0.5">{value}</p>
    </div>
  );
}

// ─── Flow Diagram ──────────────────────────────────────────────────────

function FlowDiagram() {
  return (
    <div className="rounded-xl border bg-card p-5 overflow-hidden">
      <div className="flex items-stretch gap-0">
        {[
          { label: "Your Agent", key: "pt_*", desc: "Sends traces", icon: "→" },
          { label: "Connector", key: "pc_*", desc: "WebSocket relay", icon: "→" },
          { label: "Platform", key: "sk-*", desc: "Evals & Playground", icon: null },
        ].map((item, i) => (
          <div key={item.label} className="flex items-center">
            <div className="flex-1 text-center px-3">
              <div className="rounded-lg border bg-background px-4 py-3">
                <div className="text-[11px] font-semibold mb-1">{item.label}</div>
                <code className="text-[9px] font-mono text-muted-foreground/60">{item.key}</code>
                <div className="text-[9px] text-muted-foreground mt-1">{item.desc}</div>
              </div>
            </div>
            {item.icon && (
              <div className="shrink-0 px-1">
                <div className="relative w-8 h-px bg-border">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 border-[3px] border-transparent border-l-foreground/25" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Which Keys Table ──────────────────────────────────────────────────

function WhichKeys() {
  return (
    <div className="grid gap-3 grid-cols-2">
      <div className="rounded-xl border p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground text-[10px] font-bold">
            1
          </div>
          <span className="text-xs font-semibold">Tracing Only</span>
        </div>
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li className="flex items-center gap-2">
            <Check className="size-3 text-foreground" /> Trace Key (pt_*)
          </li>
          <li className="flex items-center gap-2">
            <Check className="size-3 text-foreground" /> LLM Provider Key (for auto-evals)
          </li>
          <li className="flex items-center gap-2 text-muted-foreground/40">
            <Minus className="size-3" /> Connector Key not needed
          </li>
        </ul>
      </div>
      <div className="rounded-xl border border-foreground/20 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex size-6 items-center justify-center rounded-md bg-foreground text-background text-[10px] font-bold">
            3
          </div>
          <span className="text-xs font-semibold">Full Platform</span>
          <span className="rounded bg-foreground/5 px-1.5 py-0.5 text-[9px] text-muted-foreground">recommended</span>
        </div>
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li className="flex items-center gap-2">
            <Check className="size-3 text-foreground" /> Trace Key (pt_*)
          </li>
          <li className="flex items-center gap-2">
            <Check className="size-3 text-foreground" /> LLM Provider Key
          </li>
          <li className="flex items-center gap-2">
            <Check className="size-3 text-foreground" /> Connector Key (pc_*)
          </li>
        </ul>
      </div>
    </div>
  );
}

// ─── Setup Examples ────────────────────────────────────────────────────

function SetupExamples() {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold mb-2">Agent Trace Setup</h4>
        <CodeBlock
          filename="terminal"
          code={`# In your agent's .env file:
PHOENIX_COLLECTOR_ENDPOINT=https://phoenix.rheon.kr/api/collect
PHOENIX_API_KEY=pt_your_trace_key

# That's it — traces will flow to your project automatically.
# The pt_ key determines which project receives the traces.`}
        />
      </div>
      <div>
        <h4 className="text-xs font-semibold mb-2">Connector Setup</h4>
        <CodeBlock
          filename="terminal"
          code={`pip install phoenix-connector

# Interactive mode — prompts for everything:
phoenix-connector

# Or with flags:
phoenix-connector --key=pc_your_key --agent=http://localhost:2024`}
        />
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────

export function ApiKeys() {
  const [activeKey, setActiveKey] = useState(0);

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Getting Started
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">API Keys</h1>
      <p className="text-sm text-muted-foreground mb-10">
        My Own Phoenix uses three types of API keys. Each serves a different purpose.
      </p>

      {/* Key selector + detail */}
      <div className="flex gap-4 mb-10">
        <div className="w-[280px] shrink-0 space-y-2">
          {KEYS.map((k, i) => (
            <KeyCard key={k.name} info={k} isActive={activeKey === i} onClick={() => setActiveKey(i)} />
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <KeyDetail info={KEYS[activeKey]} />
        </div>
      </div>

      {/* Flow */}
      <div className="mb-10">
        <h3 className="text-sm font-semibold mb-4">How keys are used</h3>
        <FlowDiagram />
      </div>

      {/* Which keys */}
      <div className="mb-10">
        <h3 className="text-sm font-semibold mb-4">Which keys do I need?</h3>
        <WhichKeys />
      </div>

      {/* Setup */}
      <div>
        <h3 className="text-sm font-semibold mb-4">Quick Setup</h3>
        <SetupExamples />
      </div>
    </div>
  );
}
