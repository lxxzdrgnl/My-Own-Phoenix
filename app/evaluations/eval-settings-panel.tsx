"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import { Zap, MessageSquare, CircleOff, Check, ArrowRight } from "lucide-react";

const CONTEXT_SOURCES = [
  {
    id: "auto",
    icon: Zap,
    label: "Auto Detect",
    shortDesc: "Recommended",
    desc: "Automatically collects context from all available sources in priority order.",
    details: [
      { step: "1", text: "TOOL / RETRIEVER span outputs", sub: "e.g. web_search, get_market_data results" },
      { step: "2", text: "<context> tags in root span input", sub: "XML-style context injection" },
      { step: "3", text: "System prompt from LLM messages", sub: "System role content > 100 chars" },
      { step: "4", text: "Falls back to \"(no context)\"", sub: "Evals still run without reference" },
    ],
    useCase: "Best for most agents — works with RAG, tool-calling, and multi-step agents without any configuration.",
    agents: ["Tool-calling agents", "RAG pipelines", "Multi-step agents", "General purpose"],
  },
  {
    id: "system_prompt",
    icon: MessageSquare,
    label: "System Prompt",
    shortDesc: "RAG injection",
    desc: "Extracts context from the LLM's system message content only.",
    details: [
      { step: "1", text: "Reads system role message from LLM input", sub: "First message with role=system" },
      { step: "2", text: "Requires 100+ characters", sub: "Short system prompts are skipped" },
      { step: "3", text: "Truncated to 5,000 characters", sub: "Prevents excessive token usage" },
    ],
    useCase: "Use when retrieved documents are prepended to the system instruction, not passed via tool calls.",
    agents: ["RAG with system prompt injection", "Context-augmented chat"],
  },
  {
    id: "none",
    icon: CircleOff,
    label: "No Context",
    shortDesc: "Simple chat",
    desc: "Evaluators receive no context — judges response quality alone.",
    details: [
      { step: "1", text: "Always passes \"(no context)\"", sub: "To all context-dependent evals" },
      { step: "2", text: "Hallucination, citation, RAG relevance", sub: "Evaluate without reference data" },
      { step: "3", text: "Response quality focus", sub: "Correctness, safety, banned words still work" },
    ],
    useCase: "For simple chat agents without retrieval or tool use. Evals focus on response quality, not grounding.",
    agents: ["Simple chatbots", "Creative writing agents", "No-retrieval assistants"],
  },
];

interface EvalSettingsPanelProps {
  projectId: string;
}

export function EvalSettingsPanel({ projectId }: EvalSettingsPanelProps) {
  const [contextSource, setContextSource] = useState("auto");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/settings?scope=project&projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.evalContextSource) setContextSource(data.evalContextSource);
      })
      .catch(() => {});
  }, [projectId]);

  const handleSave = async (value: string) => {
    if (value === contextSource) return;
    setContextSource(value);
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "evalContextSource", value, scope: "project", projectId }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const activeSource = CONTEXT_SOURCES.find((s) => s.id === contextSource) ?? CONTEXT_SOURCES[0];
  const displaySource = hoveredId
    ? CONTEXT_SOURCES.find((s) => s.id === hoveredId) ?? activeSource
    : activeSource;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight">Eval Settings</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Configure how the eval worker processes traces for this project.
          </p>
        </div>

        {/* Context Source */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                Context Source
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Where to extract context for hallucination, citation, and RAG relevance evals.
              </p>
            </div>
            {saved && (
              <span className="flex items-center gap-1 text-xs text-foreground font-medium animate-in fade-in">
                <Check className="size-3.5" /> Saved
              </span>
            )}
          </div>

          <div className="flex items-start gap-4">
            {/* Left — Option cards */}
            <div className="w-[280px] shrink-0 flex flex-col gap-2">
              {CONTEXT_SOURCES.map((src) => {
                const Icon = src.icon;
                const isActive = contextSource === src.id;
                const isHovered = hoveredId === src.id;

                return (
                  <button
                    key={src.id}
                    onClick={() => handleSave(src.id)}
                    onMouseEnter={() => setHoveredId(src.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    disabled={saving}
                    className={cn(
                      "group relative flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-all duration-150",
                      isActive
                        ? "border-foreground bg-foreground/[0.03]"
                        : "border-border/60 hover:border-foreground/30 hover:bg-accent/30",
                    )}
                  >
                    {/* Radio */}
                    <div className={cn(
                      "flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
                      isActive ? "border-foreground" : "border-muted-foreground/25"
                    )}>
                      {isActive && <div className="size-[8px] rounded-full bg-foreground" />}
                    </div>

                    {/* Icon */}
                    <div className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
                      isActive ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                    )}>
                      <Icon className="size-3.5" />
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium">{src.label}</p>
                        <span className={cn(
                          "text-[9px] uppercase tracking-wider font-medium",
                          isActive ? "text-foreground/50" : "text-muted-foreground/40"
                        )}>
                          {src.shortDesc}
                        </span>
                      </div>
                    </div>

                    {/* Arrow on hover */}
                    <ArrowRight className={cn(
                      "size-3 shrink-0 text-muted-foreground/30 transition-all duration-150",
                      (isHovered || isActive) ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-1"
                    )} />
                  </button>
                );
              })}
            </div>

            {/* Right — Detail panel */}
            <div className="flex-1 min-w-0">
              <div className="rounded-lg border bg-muted/10 p-5 min-h-[340px]">
                {/* Title */}
                <div className="flex items-center gap-2.5 mb-4 pb-4 border-b">
                  {(() => {
                    const Icon = displaySource.icon;
                    return (
                      <div className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
                        <Icon className="size-4" />
                      </div>
                    );
                  })()}
                  <div>
                    <h4 className="text-sm font-semibold tracking-tight">{displaySource.label}</h4>
                    <p className="text-[11px] text-muted-foreground">{displaySource.desc}</p>
                  </div>
                </div>

                {/* How it works */}
                <div className="mb-4">
                  <h5 className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-2.5">
                    How it works
                  </h5>
                  <div className="space-y-2">
                    {displaySource.details.map((d, i) => (
                      <div key={i} className="flex gap-2.5">
                        <div className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                          {d.step}
                        </div>
                        <div>
                          <p className="text-[12px] font-medium leading-tight">{d.text}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{d.sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* When to use */}
                <div className="mb-4">
                  <h5 className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-2">
                    When to use
                  </h5>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {displaySource.useCase}
                  </p>
                </div>

                {/* Suitable agents */}
                <div>
                  <h5 className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-2">
                    Suitable for
                  </h5>
                  <div className="flex flex-wrap gap-1">
                    {displaySource.agents.map((a) => (
                      <span key={a} className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
