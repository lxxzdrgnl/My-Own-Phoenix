"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/lib/project-context";
import { MembersTab } from "./members-tab";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, CheckCircle, Loader2, AlertTriangle, ArrowRightLeft, Copy, Check, RefreshCw } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { RoleGate } from "@/components/ui/role-gate";
import { useT } from "@/lib/i18n";

function useTabs() {
  const t = useT();
  return [
    { id: "members", label: t.projectSettings.members },
    { id: "api-keys", label: t.projectSettings.apiKeys },
    { id: "agent", label: t.projectSettings.agent },
    { id: "danger", label: t.projectSettings.dangerZone },
  ];
}

const PROVIDERS = [
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { id: "google", label: "Google", placeholder: "AIza..." },
  { id: "xai", label: "xAI", placeholder: "xai-..." },
];

function ApiKeysTab() {
  const { id: projectId } = useProject();
  const confirm = useConfirm();
  const t = useT();
  const [keys, setKeys] = useState<{ id: string; provider: string; isActive: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [traceKey, setTraceKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const load = useCallback(async () => {
    try {
      const [provRes, keyRes, membersRes] = await Promise.all([
        apiFetch(`/api/projects/${projectId}/providers`),
        apiFetch(`/api/projects/${projectId}/trace-key`),
        apiFetch(`/api/projects/${projectId}/members`),
      ]);
      const provData = await provRes.json();
      if (provRes.ok) setKeys(provData.providers || []);

      const keyData = await keyRes.json();
      if (keyRes.ok && keyData.key) setTraceKey(keyData.key);

      const membersData = await membersRes.json();
      if (membersRes.ok) setIsOwner(membersData.currentRole === "owner");
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (provider: string) => {
    if (!newKey.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: newKey.trim() }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `${res.status}`;
        try { msg = JSON.parse(text).message || msg; } catch { msg = text || msg; }
        alert(`Failed to save key: ${msg}`);
      } else {
        setAdding(null);
        setNewKey("");
        await load();
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: t.projectSettings.removeApiKey,
      description: t.projectSettings.removeApiKeyDesc,
      confirmText: t.common.remove,
    });
    if (!ok) return;
    await apiFetch(`/api/projects/${projectId}/providers/${id}`, { method: "DELETE" });
    load();
  };

  if (loading) return <p className="text-sm text-muted-foreground">{t.common.loading}</p>;

  const handleGenerateTraceKey = async () => {
    setGeneratingKey(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/trace-key`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setTraceKey(data.key);
      }
    } catch (e) { console.error(e); }
    setGeneratingKey(false);
  };

  const handleCopyKey = () => {
    if (traceKey) {
      navigator.clipboard.writeText(traceKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Trace Key */}
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">{t.projectSettings.traceKey}</h3>
        <p className="text-xs text-muted-foreground mb-3">
          {t.projectSettings.traceKeyDesc}
        </p>
        <div className="rounded-lg border px-4 py-3 space-y-3">
          {traceKey && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">{traceKey}</code>
                <button onClick={handleCopyKey} className="rounded-md p-2 hover:bg-accent">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
              <div className="rounded-md bg-muted/50 p-3 font-mono text-[11px] text-muted-foreground space-y-1">
                <p># Agent .env</p>
                <p>PHOENIX_COLLECTOR_ENDPOINT=https://phoenix.rheon.kr/api/collect</p>
                <p>PHOENIX_API_KEY={traceKey}</p>
              </div>
            </div>
          )}
          <RoleGate minRole="owner">
            <Button size="sm" variant="outline" onClick={handleGenerateTraceKey} disabled={generatingKey}>
              {generatingKey ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1.5 h-3 w-3" />}
              {traceKey ? t.projectSettings.regenerate : t.projectSettings.generateTraceKey}
            </Button>
          </RoleGate>
        </div>
      </section>

      {/* LLM Provider Keys */}
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">{t.projectSettings.llmProviderKeys}</h3>
        <p className="text-xs text-muted-foreground mb-3">
          {t.projectSettings.llmProviderKeysDesc}
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
                      <span className="text-xs text-muted-foreground">{t.projectSettings.configured}</span>
                    </div>
                    <RoleGate>
                      <button onClick={() => handleDelete(existing.id)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </RoleGate>
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
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : t.common.save}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setAdding(null); setNewKey(""); }}>
                      {t.common.cancel}
                    </Button>
                  </div>
                ) : (
                  <div className="flex-1">
                    <RoleGate>
                      <Button size="sm" variant="outline" onClick={() => setAdding(p.id)}>
                        <Plus className="mr-1 h-3 w-3" /> {t.projectSettings.addKey}
                      </Button>
                    </RoleGate>
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
  const t = useT();
  const TABS = useTabs();
  const [activeTab, setActiveTab] = useState("members");

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-xl font-semibold tracking-tight mb-1">{t.projectSettings.title}</h1>
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
{activeTab === "danger" && <DangerTab />}
    </div>
  );
}

interface MemberInfo {
  id: string;
  userId: string;
  role: string;
  user: { id: string; email: string; name: string | null };
}

function DangerTab() {
  const { id: projectId, name } = useProject();
  const router = useRouter();
  const t = useT();
  const [currentRole, setCurrentRole] = useState("");
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Transfer state
  const [transferTarget, setTransferTarget] = useState("");
  const [transferConfirm, setTransferConfirm] = useState("");
  const [transferring, setTransferring] = useState(false);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    apiFetch(`/api/projects/${projectId}/members`)
      .then((r) => r.json())
      .then((data) => {
        setMembers(data.members || []);
        setCurrentRole(data.currentRole || "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  const isOwner = currentRole === "owner";
  const otherMembers = members.filter((m) => m.role !== "owner");

  const handleTransfer = async () => {
    if (transferConfirm !== name) return;
    setTransferring(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: transferTarget, confirmProjectName: name }),
      });
      if (res.ok) {
        setCurrentRole("editor");
        setTransferTarget("");
        setTransferConfirm("");
        alert("Ownership transferred successfully.");
        window.location.reload();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed: ${err.message || res.status}`);
      }
    } catch (e) { console.error(e); }
    setTransferring(false);
  };

  const handleDelete = async () => {
    if (deleteConfirm !== name) return;
    setDeleting(true);
    try {
      const res = await apiFetch("/api/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        router.push("/projects");
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed: ${err.message || res.status}`);
        setDeleting(false);
      }
    } catch (e) {
      console.error(e);
      setDeleting(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">{t.common.loading}</p>;

  if (!isOwner) {
    return (
      <div className="rounded-lg border px-5 py-8 text-center">
        <p className="text-sm text-muted-foreground">{t.projectSettings.ownerOnly}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Transfer Ownership */}
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          <ArrowRightLeft className="inline h-3 w-3 mr-1" />
          {t.projectSettings.transferOwnership}
        </h3>
        <div className="rounded-lg border px-5 py-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t.projectSettings.transferOwnershipDesc}
          </p>
          {otherMembers.length === 0 ? (
            <p className="text-xs text-muted-foreground/60">{t.projectSettings.noOtherMembers}</p>
          ) : (
            <>
              <select
                value={transferTarget}
                onChange={(e) => setTransferTarget(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">{t.projectSettings.selectMember}</option>
                {otherMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.user.name || m.user.email} ({m.role})
                  </option>
                ))}
              </select>
              {transferTarget && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {t.projectSettings.typeToConfirm.split("{name}")[0]}<strong>{name}</strong>{t.projectSettings.typeToConfirm.split("{name}")[1]}
                  </p>
                  <Input
                    value={transferConfirm}
                    onChange={(e) => setTransferConfirm(e.target.value)}
                    placeholder={name}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTransfer}
                    disabled={transferConfirm !== name || transferring}
                  >
                    {transferring ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                    {t.projectSettings.transferOwnership}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Delete Project */}
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-destructive mb-3">
          <AlertTriangle className="inline h-3 w-3 mr-1" />
          {t.projectSettings.deleteProject}
        </h3>
        <div className="rounded-lg border border-destructive/20 px-5 py-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t.projectSettings.deleteProjectDesc}
          </p>
          <p className="text-xs text-muted-foreground">
            {t.projectSettings.typeToConfirm.split("{name}")[0]}<strong>{name}</strong>{t.projectSettings.typeToConfirm.split("{name}")[1]}
          </p>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={name}
            className="text-sm"
          />
          <Button
            size="sm"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteConfirm !== name || deleting}
          >
            {deleting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            {t.projectSettings.deleteProject}
          </Button>
        </div>
      </section>
    </div>
  );
}

function AgentTab() {
  const { id: projectId, name } = useProject();
  const t = useT();
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
          {t.projectSettings.connectedAgents}
        </h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        ) : connectors.length === 0 ? (
          <div className="rounded-lg border border-dashed px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground mb-1">{t.projectSettings.noAgentsConnected}</p>
            <p className="text-xs text-muted-foreground/60">
              {t.projectSettings.noAgentsConnectedDesc}
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
          {t.projectSettings.setupGuide}
        </h3>
        <div className="rounded-lg border px-5 py-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t.projectSettings.setupGuideDesc}
          </p>
          <div className="rounded-lg bg-muted/50 p-3 font-mono text-xs text-muted-foreground break-all">
            pip install phoenix-connector
            <br />
            phoenix-connector --key=pc_... --agent=http://localhost:2024 --project={name}
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            {t.projectSettings.connectorKeyHint}
          </p>
        </div>
      </section>
    </div>
  );
}
