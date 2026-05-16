"use client";
import { apiFetch } from "@/lib/api-client";

import { useState, useCallback, useEffect } from "react";
import { Trash2, Bot, Plus, CheckCircle, Loader2, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormLabel, FormError } from "@/components/ui/form-field";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { ChatSuggestion, MAX_CHAT_SUGGESTIONS, parseChatSuggestions } from "@/lib/constants";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface AgentConfig {
  id: string;
  projectName: string;
  alias: string | null;
  agentType: string;
  endpoint: string;
  assistantId: string;
  templateId: string | null;
  template?: { id: string; name: string; description?: string } | null;
}

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  agentType: string;
  endpoint: string;
  assistantId: string;
}

export function ChatSection() {
  const [configs, setConfigs] = useState<AgentConfig[]>([]);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, templateRes] = await Promise.all([
        apiFetch("/api/agent-config").then((r) => r.json()),
        apiFetch("/api/agent-templates").then((r) => r.json()),
      ]);
      setConfigs(configRes.configs ?? []);
      setTemplates(templateRes.templates ?? []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDisconnect(project: string) {
    const ok = await confirm({
      title: "Disconnect agent",
      description: `The agent will be disconnected from project "${project}".`,
      confirmText: "Disconnect",
    });
    if (!ok) return;
    await apiFetch(`/api/agent-config?project=${encodeURIComponent(project)}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-semibold tracking-tight">Chat</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Manage which agents are connected to each Phoenix project.
        </p>
      </div>

      {loading && <LoadingState />}

      {!loading && (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                Project Agent Mapping
              </h3>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {configs.length}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {configs.length === 0 && !showAddForm && (
              <EmptyState
                icon={Bot}
                title="No project-agent connections"
                description="Connect an agent to a project using the button below."
              />
            )}

            <div className="space-y-2">
              {configs.map((c) => (
                <ProjectCard
                  key={c.id}
                  config={c}
                  templates={templates}
                  expanded={expandedId === c.id}
                  onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  onDisconnect={() => handleDisconnect(c.projectName)}
                  onUpdated={() => load()}
                />
              ))}

              {showAddForm ? (
                <AddProjectForm
                  existingProjects={configs.map((c) => c.projectName)}
                  templates={templates}
                  onCancel={() => setShowAddForm(false)}
                  onSaved={() => { setShowAddForm(false); load(); }}
                />
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-muted-foreground/60 transition-colors hover:border-foreground/20 hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                  Connect Project
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ── Project Card ──

function ProjectCard({
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
          Configuration
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
          Starter Questions
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
  const [alias, setAlias] = useState(config.alias ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState(config.templateId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const dirty = alias !== (config.alias ?? "") || selectedTemplateId !== (config.templateId ?? "");
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  async function handleSave() {
    if (!selectedTemplateId) { setError("Select an agent."); return; }
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
          <FormLabel>Display Name</FormLabel>
          <Input placeholder={config.projectName} value={alias} onChange={(e) => { setAlias(e.target.value); setSaved(false); }} className="text-xs" />
        </div>
        <div>
          <FormLabel>Agent Template</FormLabel>
          <select value={selectedTemplateId} onChange={(e) => { setSelectedTemplateId(e.target.value); setSaved(false); }} className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring">
            <option value="">Select agent...</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.description ? ` — ${t.description}` : ""}</option>)}
          </select>
        </div>
      </div>
      {error && <FormError message={error} />}
      <div className="flex items-center gap-2">
        {dirty && (
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving || !selectedTemplateId}>
            {saving ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
            Save Changes
          </Button>
        )}
        {saved && !dirty && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <CheckCircle className="h-3 w-3 text-[#10b981]" /> Saved
          </span>
        )}
        <div className="flex-1" />
        <button onClick={onDisconnect} className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/30 transition-colors hover:text-[#ef4444]">
          <Trash2 className="h-3 w-3" /> Disconnect
        </button>
      </div>
    </div>
  );
}

// ── Questions Tab ──

function QuestionsTab({ project }: { project: string }) {
  const [suggestions, setSuggestions] = useState<ChatSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [addMode, setAddMode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/settings");
      const data = await res.json();
      setSuggestions(parseChatSuggestions(data[`chatSuggestions:${project}`]));
    } catch { setSuggestions([]); }
    setLoading(false);
  }, [project]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [`chatSuggestions:${project}`]: JSON.stringify(suggestions) }),
      });
      setSaved(true);
      setDirty(false);
    } catch { console.error("Failed to save"); }
    setSaving(false);
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-2">
      {suggestions.map((s, idx) => (
        <div key={idx}>
          {editIdx === idx ? (
            <QuestionInlineForm
              initial={s}
              onSave={(u) => { setSuggestions((p) => p.map((x, i) => i === idx ? u : x)); setEditIdx(null); setDirty(true); setSaved(false); }}
              onCancel={() => setEditIdx(null)}
            />
          ) : (
            <div className="group flex items-center gap-2 rounded-md border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-muted/20">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setEditIdx(idx)}>
                <p className="text-xs font-medium truncate">{s.title || "Untitled"}</p>
                <p className="text-[10px] text-muted-foreground/50 truncate">{s.label}</p>
              </div>
              <button
                onClick={() => { setSuggestions((p) => p.filter((_, i) => i !== idx)); setDirty(true); setSaved(false); if (editIdx === idx) setEditIdx(null); }}
                className="rounded p-1 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/30 hover:!text-[#ef4444]"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      ))}

      {suggestions.length === 0 && !addMode && (
        <p className="text-xs text-muted-foreground/40 py-2">No starter questions yet.</p>
      )}

      {addMode ? (
        <QuestionInlineForm
          initial={{ title: "", label: "", prompt: "" }}
          onSave={(n) => { setSuggestions((p) => [...p, n]); setAddMode(false); setDirty(true); setSaved(false); }}
          onCancel={() => setAddMode(false)}
        />
      ) : (
        <div className="flex items-center gap-2 pt-1">
          {suggestions.length < MAX_CHAT_SUGGESTIONS && (
            <button onClick={() => setAddMode(true)} className="flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-[11px] text-muted-foreground/50 transition-colors hover:border-foreground/20 hover:text-foreground">
              <Plus className="h-3 w-3" /> Add
            </button>
          )}
          {dirty && (
            <Button onClick={handleSave} disabled={saving} size="sm" className="h-7 text-xs">
              {saving ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
              Save
            </Button>
          )}
          {saved && !dirty && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <CheckCircle className="h-3 w-3 text-[#10b981]" /> Saved
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Question Inline Form ──

function QuestionInlineForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ChatSuggestion;
  onSave: (s: ChatSuggestion) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [label, setLabel] = useState(initial.label);
  const [prompt, setPrompt] = useState(initial.prompt);

  return (
    <div className="rounded-md border bg-muted/5 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="text-xs"
          autoFocus
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Subtitle (optional)"
          className="text-xs"
        />
      </div>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Full prompt sent to the agent..."
        rows={2}
        className="text-xs"
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => { if (title.trim() && prompt.trim()) onSave({ title: title.trim(), label: label.trim(), prompt: prompt.trim() }); }}
          disabled={!title.trim() || !prompt.trim()}
        >
          {initial.title ? "Update" : "Add"}
        </Button>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Add Project Form ──

function AddProjectForm({
  existingProjects,
  templates,
  onCancel,
  onSaved,
}: {
  existingProjects: string[];
  templates: AgentTemplate[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [project, setProject] = useState("");
  const [alias, setAlias] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const isDuplicate = project.trim() !== "" && existingProjects.includes(project.trim());

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  async function handleSave() {
    if (!project.trim()) { setError("Enter a project name."); return; }
    if (isDuplicate) { setError(`Project "${project.trim()}" already exists.`); return; }
    if (!selectedTemplateId) { setError("Select an agent."); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/agent-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: project.trim(),
          alias: alias.trim() || null,
          templateId: selectedTemplateId,
          agentType: selectedTemplate?.agentType ?? "langgraph",
          endpoint: selectedTemplate?.endpoint ?? "http://localhost:2024",
          assistantId: selectedTemplate?.assistantId ?? "agent",
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save.");
        return;
      }
      onSaved();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">New Project Connection</p>
        <button onClick={onCancel} className="rounded p-1 text-muted-foreground/40 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FormLabel>Project Name</FormLabel>
          <Input
            value={project}
            onChange={(e) => { setProject(e.target.value); setError(undefined); }}
            placeholder="e.g. legal-rag"
            className="text-xs"
          />
          {isDuplicate && (
            <p className="mt-1 text-[10px] text-destructive">Already exists.</p>
          )}
        </div>
        <div>
          <FormLabel>Display Name (optional)</FormLabel>
          <Input
            placeholder={project || "Alias"}
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            className="text-xs"
          />
        </div>
      </div>

      <div>
        <FormLabel>Agent</FormLabel>
        <select
          value={selectedTemplateId}
          onChange={(e) => setSelectedTemplateId(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Select agent...</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} {t.description ? `— ${t.description}` : ""}
            </option>
          ))}
        </select>
        {templates.length === 0 && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            No agents registered. Go to Settings &gt; Agents to register one.
          </p>
        )}
      </div>

      {selectedTemplate && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{selectedTemplate.agentType}</span>
          <span className="font-mono">{selectedTemplate.endpoint}</span>
          <span>·</span>
          <span className="font-mono">{selectedTemplate.assistantId}</span>
        </div>
      )}

      {error && <FormError message={error} />}

      <div className="flex items-center gap-2 border-t pt-3">
        <Button size="sm" className="text-xs" onClick={handleSave} disabled={saving || !project.trim() || isDuplicate || !selectedTemplateId}>
          {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Create
        </Button>
        <Button variant="ghost" size="sm" className="text-xs" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
