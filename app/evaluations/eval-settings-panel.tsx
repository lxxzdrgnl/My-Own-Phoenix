"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import { CheckCircle, Loader2 } from "lucide-react";

const CONTEXT_SOURCES = [
  {
    id: "auto",
    label: "Auto Detect",
    desc: "Automatically collects context from all available sources in priority order.",
    details: [
      "1. TOOL / RETRIEVER span outputs (e.g. web_search, get_market_data results)",
      "2. <context> tags in root span input",
      "3. System prompt from LLM input messages",
      "4. Falls back to \"(no context)\" if nothing found",
    ],
    example: "Best for most agents. Works with RAG, tool-calling, and multi-step agents without configuration.",
  },
  {
    id: "system_prompt",
    label: "System Prompt",
    desc: "Extracts context from the LLM's system message content only.",
    details: [
      "Reads the system role message from LLM span input",
      "Uses the first system message with 100+ characters",
      "Ignores TOOL/RETRIEVER outputs and input tags",
      "Truncated to 5000 characters",
    ],
    example: "Use when context is injected directly into the system prompt (e.g. RAG-augmented system messages where retrieved docs are prepended to the system instruction).",
  },
  {
    id: "none",
    label: "No Context",
    desc: "Always passes \"(no context)\" to evaluators.",
    details: [
      "Context-dependent evals (hallucination, citation, rag_relevance) will evaluate without reference data",
      "LLM evaluator judges based on response quality alone",
    ],
    example: "Use for simple chat agents without retrieval or tool use. Evals focus on response quality, not grounding.",
  },
];

interface EvalSettingsPanelProps {
  projectId: string;
}

export function EvalSettingsPanel({ projectId }: EvalSettingsPanelProps) {
  const [contextSource, setContextSource] = useState("auto");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/settings?scope=project&projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.evalContextSource) setContextSource(data.evalContextSource);
      })
      .catch(() => {});
  }, [projectId]);

  const handleSave = async (value: string) => {
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
  const previewSource = selectedPreview ? CONTEXT_SOURCES.find((s) => s.id === selectedPreview) : null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Eval Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure how evaluations run for this project.
          </p>
        </div>

        {/* Context Source */}
        <section className="mb-8">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
            Context Source
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Determines where the eval worker extracts context (retrieved documents, tool outputs, etc.) for evaluations like hallucination, citation, and RAG relevance.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* Left: Options */}
            <div className="space-y-1.5">
              {CONTEXT_SOURCES.map((src) => (
                <button
                  key={src.id}
                  onClick={() => handleSave(src.id)}
                  onMouseEnter={() => setSelectedPreview(src.id)}
                  onMouseLeave={() => setSelectedPreview(null)}
                  disabled={saving}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                    contextSource === src.id
                      ? "border-foreground bg-accent"
                      : "hover:border-border hover:bg-accent/30"
                  )}
                >
                  <div className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                    contextSource === src.id ? "border-foreground" : "border-muted-foreground/30"
                  )}>
                    {contextSource === src.id && <div className="size-2 rounded-full bg-foreground" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{src.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{src.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Right: Details preview */}
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold">{(previewSource ?? activeSource).label}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{(previewSource ?? activeSource).desc}</p>
                </div>

                <div>
                  <h5 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">How it works</h5>
                  <ul className="space-y-1">
                    {(previewSource ?? activeSource).details.map((d, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground flex gap-2">
                        <span className="text-muted-foreground/40 shrink-0">•</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h5 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">When to use</h5>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {(previewSource ?? activeSource).example}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {saved && (
            <p className="mt-2 flex items-center gap-1 text-[11px] text-foreground">
              <CheckCircle className="size-3" /> Saved
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
