"use client";

import { useState, useEffect, useCallback } from "react";
import { useProject } from "@/lib/project-context";
import { MembersTab } from "./members-tab";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, CheckCircle, Loader2 } from "lucide-react";

const TABS = [
  { id: "members", label: "Members" },
  { id: "api-keys", label: "API Keys" },
  { id: "agent", label: "Agent" },
  { id: "eval", label: "Eval" },
  { id: "danger", label: "Danger Zone" },
];

const PROVIDERS = [
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { id: "google", label: "Google", placeholder: "AIza..." },
  { id: "xai", label: "xAI", placeholder: "xai-..." },
];

function ApiKeysTab() {
  const { id: projectId } = useProject();
  const [keys, setKeys] = useState<{ id: string; provider: string; isActive: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}/providers`);
      if (res.ok) {
        const data = await res.json();
        setKeys(data.providers || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (provider: string) => {
    if (!newKey.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/api/projects/${projectId}/providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: newKey.trim() }),
      });
      setAdding(null);
      setNewKey("");
      load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this API key?")) return;
    await apiFetch(`/api/projects/${projectId}/providers/${id}`, { method: "DELETE" });
    load();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Trace API Key</h3>
        <div className="rounded-lg border px-5 py-4">
          <p className="text-xs text-muted-foreground">
            Set <code className="rounded bg-muted px-1.5 py-0.5 font-mono">PHOENIX_API_KEY</code> in your agent to send traces to this project.
          </p>
        </div>
      </section>

      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">LLM Provider Keys</h3>
        <p className="text-xs text-muted-foreground mb-3">
          API keys used for evaluations and playground in this project.
        </p>
        <div className="space-y-2">
          {PROVIDERS.map((p) => {
            const existing = keys.find((k) => k.provider === p.id);
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border px-4 py-3">
                <div className="w-20">
                  <p className="text-sm font-medium">{p.label}</p>
                </div>
                {existing ? (
                  <>
                    <div className="flex-1 flex items-center gap-2">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-xs text-muted-foreground">Configured</span>
                    </div>
                    <button onClick={() => handleDelete(existing.id)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : adding === p.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <Input
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder={p.placeholder}
                      autoFocus
                      className="h-8 text-xs font-mono"
                    />
                    <Button size="sm" onClick={() => handleAdd(p.id)} disabled={saving || !newKey.trim()}>
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setAdding(null); setNewKey(""); }}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex-1">
                    <Button size="sm" variant="outline" onClick={() => setAdding(p.id)}>
                      <Plus className="mr-1 h-3 w-3" /> Add Key
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default function ProjectSettingsPage() {
  const { name } = useProject();
  const [activeTab, setActiveTab] = useState("members");

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-xl font-semibold tracking-tight mb-1">Project Settings</h1>
      <p className="text-sm text-muted-foreground mb-6">{name}</p>

      <div className="flex gap-1 border-b mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "members" && <MembersTab />}
      {activeTab === "api-keys" && <ApiKeysTab />}
      {activeTab === "agent" && <AgentTab />}
      {activeTab === "eval" && (
        <div className="space-y-6">
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Eval Worker</h3>
            <div className="rounded-lg border px-5 py-4">
              <p className="text-xs text-muted-foreground">
                The eval worker runs automated evaluations on new traces.
                Configure it in Global Settings.
              </p>
            </div>
          </section>
        </div>
      )}
      {activeTab === "danger" && (
        <div className="space-y-6">
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-destructive mb-3">Delete Project</h3>
            <div className="rounded-lg border border-destructive/20 px-5 py-4">
              <p className="text-xs text-muted-foreground mb-3">
                Permanently delete this project and all its data. This action cannot be undone.
              </p>
              <button className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:bg-destructive/90">
                Delete Project
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function AgentTab() {
  const { id: projectId, name } = useProject();
  const [connectors, setConnectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/connectors?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => setConnectors(data.connectors || []))
      .catch(console.error)
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      apiFetch(`/api/connectors?projectId=${projectId}`)
        .then((r) => r.json())
        .then((data) => setConnectors(data.connectors || []))
        .catch(console.error);
    }, 10000);
    return () => clearInterval(interval);
  }, [projectId]);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Connected Agents
        </h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : connectors.length === 0 ? (
          <div className="rounded-lg border border-dashed px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground mb-1">No agents connected</p>
            <p className="text-xs text-muted-foreground/60">
              Connect your local agent using the phoenix-connector CLI.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {connectors.map((c: any) => (
              <div
                key={c.userId}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {c.status === "online" ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{c.userName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {c.agentType} · {c.status}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Setup Guide
        </h3>
        <div className="rounded-lg border px-5 py-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Connect your local agent using the phoenix-connector CLI:
          </p>
          <div className="rounded-lg bg-muted/50 p-3 font-mono text-xs text-muted-foreground break-all">
            pip install phoenix-connector
            <br />
            phoenix-connector --key=pc_... --agent=http://localhost:2024 --project={name}
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            Get your connector key from Global Settings &rarr; Profile &amp; Key.
          </p>
        </div>
      </section>
    </div>
  );
}
