"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Callout, CodeBlock } from "../code-block";
import { Key, Plug, Bot, Shield, Check, Minus } from "lucide-react";
import { useT } from "@/lib/i18n";

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

function useKeys(): KeyInfo[] {
  const t = useT();
  return [
    {
      icon: Shield,
      name: t.docs.apiKeys.traceKeyName,
      prefix: "pt_*",
      color: "bg-foreground",
      purpose: t.docs.apiKeys.traceKeyPurpose,
      location: t.docs.apiKeys.traceKeyLocation,
      usedBy: t.docs.apiKeys.traceKeyUsedBy,
      scope: t.docs.apiKeys.traceKeyScope,
      envVar: "PHOENIX_API_KEY",
      note: t.docs.apiKeys.traceKeyNote,
      steps: [
        { action: t.docs.apiKeys.traceKeyStep1Action, detail: t.docs.apiKeys.traceKeyStep1Detail },
        { action: t.docs.apiKeys.traceKeyStep2Action, detail: t.docs.apiKeys.traceKeyStep2Detail },
        { action: t.docs.apiKeys.traceKeyStep3Action, detail: t.docs.apiKeys.traceKeyStep3Detail },
        { action: t.docs.apiKeys.traceKeyStep4Action, detail: t.docs.apiKeys.traceKeyStep4Detail },
      ],
    },
    {
      icon: Plug,
      name: t.docs.apiKeys.connectorKeyName,
      prefix: "pc_*",
      color: "bg-foreground/80",
      purpose: t.docs.apiKeys.connectorKeyPurpose,
      location: t.docs.apiKeys.connectorKeyLocation,
      usedBy: t.docs.apiKeys.connectorKeyUsedBy,
      scope: t.docs.apiKeys.connectorKeyScope,
      envVar: undefined,
      note: t.docs.apiKeys.connectorKeyNote,
      steps: [
        { action: t.docs.apiKeys.connectorKeyStep1Action, detail: t.docs.apiKeys.connectorKeyStep1Detail },
        { action: t.docs.apiKeys.connectorKeyStep2Action, detail: t.docs.apiKeys.connectorKeyStep2Detail },
        { action: t.docs.apiKeys.connectorKeyStep3Action, detail: t.docs.apiKeys.connectorKeyStep3Detail },
        { action: t.docs.apiKeys.connectorKeyStep4Action, detail: t.docs.apiKeys.connectorKeyStep4Detail },
      ],
    },
    {
      icon: Bot,
      name: t.docs.apiKeys.llmKeyName,
      prefix: "sk-*, key-*",
      color: "bg-foreground/60",
      purpose: t.docs.apiKeys.llmKeyPurpose,
      location: t.docs.apiKeys.llmKeyLocation,
      usedBy: t.docs.apiKeys.llmKeyUsedBy,
      scope: t.docs.apiKeys.llmKeyScope,
      envVar: undefined,
      note: t.docs.apiKeys.llmKeyNote,
      steps: [
        { action: t.docs.apiKeys.llmKeyStep1Action, detail: t.docs.apiKeys.llmKeyStep1Detail },
        { action: t.docs.apiKeys.llmKeyStep2Action, detail: t.docs.apiKeys.llmKeyStep2Detail },
        { action: t.docs.apiKeys.llmKeyStep3Action, detail: t.docs.apiKeys.llmKeyStep3Detail },
      ],
    },
  ];
}

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
  const t = useT();
  const Icon = info.icon;
  return (
    <div className="rounded-xl border overflow-hidden bg-background p-5 h-full">
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
        <DetailRow label={t.docs.apiKeys.purposeLabel} value={info.purpose} />
        <DetailRow label={t.docs.apiKeys.whereToGetLabel} value={info.location} />
        <DetailRow label={t.docs.apiKeys.usedByLabel} value={info.usedBy} />
        <DetailRow label={t.docs.apiKeys.scopeLabel} value={info.scope} />

        {/* Step-by-step guide */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            {t.docs.apiKeys.howToGetItLabel}
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
              {t.docs.apiKeys.envVarLabel}
            </span>
            <div className="mt-1.5 rounded-lg bg-[#0f0f17] px-3.5 py-2">
              <code className="text-[12px] font-mono text-[#c3e88d]">{info.envVar}</code>
              <span className="text-[12px] font-mono text-[#546e7a]">=</span>
              <code className="text-[12px] font-mono text-[#c8ccd4]">{info.prefix.replace("*", "your_key_here")}</code>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground leading-relaxed pt-1">{info.note}</p>
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
  const t = useT();
  return (
    <div className="rounded-xl border bg-card p-5 overflow-hidden">
      <div className="flex items-stretch gap-0">
        {[
          { label: t.docs.apiKeys.flowYourAgent, key: "pt_*", desc: t.docs.apiKeys.flowSendsTraces, icon: "→" },
          { label: t.docs.apiKeys.flowConnector, key: "pc_*", desc: t.docs.apiKeys.flowWebSocketRelay, icon: "→" },
          { label: t.docs.apiKeys.flowPlatform, key: "sk-*", desc: t.docs.apiKeys.flowEvalsPlayground, icon: null },
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
  const t = useT();
  return (
    <div className="grid gap-px grid-cols-2 rounded-xl border overflow-hidden bg-border">
      <div className="bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground text-[10px] font-bold">
            1
          </div>
          <span className="text-xs font-semibold">{t.docs.apiKeys.tracingOnly}</span>
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
      <div className="bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex size-6 items-center justify-center rounded-md bg-foreground text-background text-[10px] font-bold">
            3
          </div>
          <span className="text-xs font-semibold">{t.docs.apiKeys.fullSetup}</span>
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
  const t = useT();
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold mb-2">{t.docs.apiKeys.agentTraceSetup}</h4>
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
        <h4 className="text-xs font-semibold mb-2">{t.docs.apiKeys.connectorSetupLabel}</h4>
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
  const t = useT();
  const KEYS = useKeys();
  const [activeKey, setActiveKey] = useState(0);

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        {t.docs.apiKeys.groupLabel}
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">{t.docs.apiKeys.title}</h1>
      <p className="text-sm text-muted-foreground mb-10">
        {t.docs.apiKeys.subtitle}
      </p>

      <div className="space-y-10">
        {/* Key selector + detail */}
        <div className="rounded-xl border overflow-hidden bg-background">
          <div className="flex gap-4 p-4">
            <div className="w-[280px] shrink-0 space-y-2">
              {KEYS.map((k, i) => (
                <KeyCard key={k.name} info={k} isActive={activeKey === i} onClick={() => setActiveKey(i)} />
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <KeyDetail info={KEYS[activeKey]} />
            </div>
          </div>
        </div>

        {/* Flow */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.apiKeys.howKeysUsed}</h3>
          <FlowDiagram />
        </div>

        {/* Which keys */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.apiKeys.whichKeys}</h3>
          <WhichKeys />
        </div>

        {/* Setup */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.apiKeys.quickSetup}</h3>
          <SetupExamples />
        </div>

        {/* Callout at bottom */}
        <Callout>
          {t.docs.apiKeys.calloutText}
        </Callout>
      </div>
    </div>
  );
}
