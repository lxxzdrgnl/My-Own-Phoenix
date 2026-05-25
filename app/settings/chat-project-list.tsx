"use client";

import { useState } from "react";
import { Bot, ChevronDown, CheckCircle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-field";
import { LoadingButton } from "@/components/ui/loading-button";
import { InlineError } from "@/components/ui/inline-error";
import { useT } from "@/lib/i18n";
import { AgentConfig, AgentTemplate } from "./chat-types";
import { QuestionsTab } from "./chat-questions";

// ── Project Card ──

export function ProjectCard({
  config: c,
  templates,
  expanded,
  onToggle,
  onDisconnect,
  onUpdated,
}: {
  config: AgentConfig;
  templates: AgentTemplate[];
  expanded: boolean;
  onToggle: () => void;
  onDisconnect: () => void;
  onUpdated: () => void;
}) {
  return (
    <div className={cn(
      "rounded-lg border transition-colors",
      expanded ? "border-foreground/15" : "hover:border-foreground/15",
    )}>
      {/* Header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60">
          <Bot className="h-4 w-4 text-muted-foreground/70" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{c.alias || c.projectName}</p>
            {c.alias && (
              <span className="text-[11px] text-muted-foreground/50">{c.projectName}</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/60">
            <span className="font-medium">{c.template?.name || "Custom"}</span>
            <span>·</span>
            <span className="font-mono">{c.endpoint}</span>
          </div>
        </div>
        <span className="mr-2 rounded-full bg-foreground/8 px-2 py-0.5 text-[10px] font-semibold text-foreground/60">
          {c.agentType}
        </span>
        <ChevronDown className={cn(
          "h-4 w-4 text-muted-foreground/40 transition-transform",
          expanded && "rotate-180",
        )} />
      </button>

      {/* Expanded panel */}
      {expanded && (
        <ExpandedPanel config={c} templates={templates} onSaved={onUpdated} onDisconnect={onDisconnect} />
      )}
    </div>
  );
}

// ── Expanded Panel with Tabs ──

function ExpandedPanel({
  config,
  templates,
  onSaved,
  onDisconnect,
}: {
  config: AgentConfig;
  templates: AgentTemplate[];
  onSaved: () => void;
  onDisconnect: () => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<"config" | "questions">("config");

  return (
    <div className="border-t">
      <div className="flex items-center border-b px-4">
        <button
          onClick={() => setTab("config")}
          className={cn(
            "border-b-2 px-3 py-2 text-xs font-medium transition-colors",
            tab === "config"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground/50 hover:text-muted-foreground",
          )}
        >
          {t.settings.configTab}
        </button>
        <button
          onClick={() => setTab("questions")}
          className={cn(
            "border-b-2 px-3 py-2 text-xs font-medium transition-colors",
            tab === "questions"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground/50 hover:text-muted-foreground",
          )}
        >
          {t.settings.starterQuestionsTab}
        </button>
      </div>
      <div className="px-4 pb-4 pt-3">
        {tab === "config" && <ConfigTab config={config} templates={templates} onSaved={onSaved} onDisconnect={onDisconnect} />}
        {tab === "questions" && <QuestionsTab project={config.projectName} />}
      </div>
    </div>
  );
}

// ── Config Tab ──

function ConfigTab({
  config,
  templates,
  onSaved,
  onDisconnect,
}: {
  config: AgentConfig;
  templates: AgentTemplate[];
  onSaved: () => void;
  onDisconnect: () => void;
}) {
  const t = useT();
  const [alias, setAlias] = useState(config.alias ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState(config.templateId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const dirty = alias !== (config.alias ?? "") || selectedTemplateId !== (config.templateId ?? "");
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  async function handleSave() {
    if (!selectedTemplateId) { setError(`${t.settings.selectAgent}`); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/agent-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: config.projectName,
          alias: alias.trim() || null,
          templateId: selectedTemplateId,
          agentType: selectedTemplate?.agentType ?? "langgraph",
          endpoint: selectedTemplate?.endpoint ?? "http://localhost:2024",
          assistantId: selectedTemplate?.assistantId ?? "agent",
        }),
      });
      if (!res.ok) { setError((await res.json()).error ?? "Failed"); return; }
      setSaved(true);
      onSaved();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FormLabel>{t.settings.displayName}</FormLabel>
          <Input placeholder={config.projectName} value={alias} onChange={(e) => { setAlias(e.target.value); setSaved(false); }} className="text-xs" />
        </div>
        <div>
          <FormLabel>{t.settings.agentTemplate}</FormLabel>
          <select value={selectedTemplateId} onChange={(e) => { setSelectedTemplateId(e.target.value); setSaved(false); }} className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring">
            <option value="">{t.settings.selectAgent}</option>
            {templates.map((tmpl) => <option key={tmpl.id} value={tmpl.id}>{tmpl.name}{tmpl.description ? ` — ${tmpl.description}` : ""}</option>)}
          </select>
        </div>
      </div>
      <InlineError>{error}</InlineError>
      <div className="flex items-center gap-2">
        {dirty && (
          <LoadingButton size="sm" className="h-7 text-xs" onClick={handleSave} disabled={!selectedTemplateId} loading={saving} loadingText={t.settings.saveChanges}>
            {t.settings.saveChanges}
          </LoadingButton>
        )}
        {saved && !dirty && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <CheckCircle className="h-3 w-3 text-[#10b981]" /> {t.settings.saved}
          </span>
        )}
        <div className="flex-1" />
        <button onClick={onDisconnect} className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/30 transition-colors hover:text-[#ef4444]">
          <Trash2 className="h-3 w-3" /> {t.settings.disconnect}
        </button>
      </div>
    </div>
  );
}
