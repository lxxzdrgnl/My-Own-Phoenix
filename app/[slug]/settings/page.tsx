"use client";

import { useState, useEffect } from "react";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { useRouter } from "next/navigation";
import { useProject } from "@/lib/project-context";
import { MembersTab } from "./members-tab";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, CheckCircle, AlertTriangle, ArrowRightLeft, Copy, Check, RefreshCw } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { RoleGate } from "@/components/ui/role-gate";
import { useT } from "@/lib/i18n";
import { useFormSubmit } from "@/lib/hooks/use-form-submit";
import { useResourceList } from "@/lib/hooks/use-resource-list";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Text, Label } from "@/components/ui/typography";
import { Stack, Inline } from "@/components/ui/stack";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingButton } from "@/components/ui/loading-button";
import { logger } from "@/lib/logger";

function useTabs() {
  const t = useT();
  return [
    { id: "members", label: t.projectSettings.members },
    { id: "api-keys", label: t.projectSettings.apiKeys },
    { id: "agent", label: t.projectSettings.agent },
    { id: "language", label: t.projectSettings.aiLanguage },
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
  const [adding, setAdding] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [traceKey, setTraceKey] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  // providers list
  const {
    items: keys,
    loading,
    reload: reloadProviders,
  } = useResourceList<{ id: string; provider: string; isActive: boolean }>(
    `/api/projects/${projectId}/providers`,
    { dataKey: "providers" },
  );

  // trace-key + members: fetched once on mount (side-effects outside useResourceList scope)
  useEffect(() => {
    Promise.all([
      apiFetch(`/api/projects/${projectId}/trace-key`),
      apiFetch(`/api/projects/${projectId}/members`),
    ])
      .then(async ([keyRes, membersRes]) => {
        const keyData = await keyRes.json();
        if (keyRes.ok && keyData.key) setTraceKey(keyData.key);

        const membersData = await membersRes.json();
        if (membersRes.ok) setIsOwner(membersData.currentRole === "owner");
      })
      .catch((e) => logger.error("api-keys tab init failed", e));
  }, [projectId]);

  // add provider key
  const { submit: submitAddKey, saving } = useFormSubmit<{ provider: string; apiKey: string }>(
    `/api/projects/${projectId}/providers`,
    "POST",
    {
      onSuccess: () => {
        setAdding(null);
        setNewKey("");
        reloadProviders();
      },
    },
  );

  // generate trace key
  const { submit: submitGenerateTraceKey, saving: generatingKey } = useFormSubmit(
    `/api/projects/${projectId}/trace-key`,
    "POST",
    {
      onSuccess: (data) => {
        if (data?.key) setTraceKey(data.key);
      },
    },
  );

  const handleAdd = async (provider: string) => {
    if (!newKey.trim()) return;
    const result = await submitAddKey({ provider, apiKey: newKey.trim() });
    if (!result) {
      // error is set in hook; surface via alert for backward compat
      alert(`Failed to save key`);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: t.projectSettings.removeApiKey,
      description: t.projectSettings.removeApiKeyDesc,
      confirmText: t.common.remove,
    });
    if (!ok) return;
    await apiFetch(`/api/projects/${projectId}/providers/${id}`, { method: "DELETE" });
    reloadProviders();
  };

  if (loading) return <Text variant="caption">{t.common.loading}</Text>;

  const handleGenerateTraceKey = () => submitGenerateTraceKey();

  const handleCopyKey = () => {
    if (traceKey) {
      void copy(traceKey);
    }
  };

  return (
    <Stack gap="lg">
      {/* Trace Key */}
      <SectionCard
        title={t.projectSettings.traceKey}
        description={t.projectSettings.traceKeyDesc}
      >
        <div className="rounded-lg border px-4 py-3">
          <Stack gap="sm">
            {traceKey && (
              <Stack gap="sm">
                <Inline gap="sm">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">{traceKey}</code>
                  <button onClick={handleCopyKey} className="rounded-md p-2 hover:bg-accent">
                    {copied ? <Check className="h-3.5 w-3.5 text-[#10b981]" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </Inline>
                <div className="rounded-md bg-muted/50 p-3 font-mono text-[11px] text-muted-foreground space-y-1">
                  <p># Agent .env</p>
                  <p>PHOENIX_COLLECTOR_ENDPOINT=https://phoenix.rheon.kr/api/collect</p>
                  <p>PHOENIX_API_KEY={traceKey}</p>
                </div>
              </Stack>
            )}
            <RoleGate minRole="owner">
              <LoadingButton size="sm" variant="outline" onClick={handleGenerateTraceKey} loading={generatingKey}>
                {!generatingKey && <RefreshCw className="mr-1.5 h-3 w-3" />}
                {traceKey ? t.projectSettings.regenerate : t.projectSettings.generateTraceKey}
              </LoadingButton>
            </RoleGate>
          </Stack>
        </div>
      </SectionCard>

      {/* LLM Provider Keys */}
      <SectionCard
        title={t.projectSettings.llmProviderKeys}
        description={t.projectSettings.llmProviderKeysDesc}
      >
        <Stack gap="sm">
          {PROVIDERS.map((p) => {
            const existing = keys.find((k) => k.provider === p.id);
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border px-4 py-3">
                <div className="w-20">
                  <Text variant="body" className="font-medium">{p.label}</Text>
                </div>
                {existing ? (
                  <>
                    <Inline gap="sm" className="flex-1">
                      <CheckCircle className="h-3.5 w-3.5 text-[#10b981]" />
                      <Text variant="caption">{t.projectSettings.configured}</Text>
                    </Inline>
                    <RoleGate>
                      <button onClick={() => handleDelete(existing.id)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </RoleGate>
                  </>
                ) : adding === p.id ? (
                  <Inline gap="sm" className="flex-1">
                    <Input
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder={p.placeholder}
                      autoFocus
                      className="h-8 text-xs font-mono"
                    />
                    <LoadingButton size="sm" onClick={() => handleAdd(p.id)} loading={saving} disabled={!newKey.trim()}>
                      {t.common.save}
                    </LoadingButton>
                    <Button size="sm" variant="outline" onClick={() => { setAdding(null); setNewKey(""); }}>
                      {t.common.cancel}
                    </Button>
                  </Inline>
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
        </Stack>
      </SectionCard>
    </Stack>
  );
}

export default function ProjectSettingsPage() {
  const { name } = useProject();
  const t = useT();
  const TABS = useTabs();
  const [activeTab, setActiveTab] = useState("members");

  return (
    <PageContainer size="narrow">
      <PageHeader title={t.projectSettings.title} description={name} />

      <div className="flex gap-1 border-b">
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
      {activeTab === "language" && <LanguageTab />}
      {activeTab === "danger" && <DangerTab />}
    </PageContainer>
  );
}

// AI 출력 언어 — eval 설명 + 금융 AI RMF 종합 피드백 공통 설정 (project-scoped)
function LanguageTab() {
  const t = useT();
  const { id: projectId } = useProject();
  const [language, setLanguage] = useState("ko");
  const [saved, setSaved] = useState(false);
  const { submit, saving } = useFormSubmit("/api/settings", "PUT", {
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });

  useEffect(() => {
    if (!projectId) return;
    apiFetch(`/api/settings?scope=project&projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => { if (d.evalLanguage === "ko" || d.evalLanguage === "en") setLanguage(d.evalLanguage); })
      .catch(() => {});
  }, [projectId]);

  const choose = async (lang: "ko" | "en") => {
    if (lang === language) return;
    setLanguage(lang);
    await submit({ key: "evalLanguage", value: lang, scope: "project", projectId });
  };

  return (
    <Stack gap="lg" className="mt-6">
      <SectionCard title={t.projectSettings.aiLanguage} description={t.projectSettings.aiLanguageDesc}>
        <div className="flex gap-2">
          {(["ko", "en"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => choose(lang)}
              disabled={saving}
              className={cn(
                "flex flex-1 items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors",
                language === lang ? "border-foreground bg-foreground/[0.03]" : "border-border/60 hover:border-foreground/30 hover:bg-accent/30",
              )}
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{lang === "ko" ? "한국어" : "English"}</p>
                <p className="text-[11px] text-muted-foreground">{lang === "ko" ? t.projectSettings.aiLangKoDesc : t.projectSettings.aiLangEnDesc}</p>
              </div>
              {language === lang && <Check className="ml-auto size-4 shrink-0" />}
            </button>
          ))}
        </div>
        {saved && <Text variant="caption" className="mt-3 flex items-center gap-1"><Check className="size-3.5" /> {t.projectSettings.languageSaved}</Text>}
      </SectionCard>
    </Stack>
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

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    apiFetch(`/api/projects/${projectId}/members`)
      .then((r) => r.json())
      .then((data) => {
        setMembers(data.items || []);
        setCurrentRole(data.currentRole || "");
      })
      .catch((e) => logger.error("settings load members failed", e))
      .finally(() => setLoading(false));
  }, [projectId]);

  const isOwner = currentRole === "owner";
  const otherMembers = members.filter((m) => m.role !== "owner");

  // transfer ownership
  const { submit: submitTransfer, saving: transferring } = useFormSubmit<{
    targetUserId: string;
    confirmProjectName: string;
  }>(`/api/projects/${projectId}/members`, "PATCH", {
    onSuccess: () => {
      setCurrentRole("editor");
      setTransferTarget("");
      setTransferConfirm("");
      alert("Ownership transferred successfully.");
      window.location.reload();
    },
  });

  // delete project
  const { submit: submitDelete, saving: deleting } = useFormSubmit<{ projectId: string }>(
    "/api/projects",
    "DELETE",
    {
      onSuccess: () => {
        router.push("/projects");
      },
    },
  );

  const handleTransfer = async () => {
    if (transferConfirm !== name) return;
    const result = await submitTransfer({ targetUserId: transferTarget, confirmProjectName: name });
    if (!result) alert(`Failed to transfer ownership`);
  };

  const handleDelete = async () => {
    if (deleteConfirm !== name) return;
    const result = await submitDelete({ projectId });
    if (!result) alert(`Failed to delete project`);
  };

  if (loading) return <Text variant="caption">{t.common.loading}</Text>;

  if (!isOwner) {
    return (
      <div className="rounded-lg border px-5 py-8 text-center">
        <Text variant="caption">{t.projectSettings.ownerOnly}</Text>
      </div>
    );
  }

  return (
    <Stack gap="lg">
      {/* Transfer Ownership */}
      <SectionCard
        title={t.projectSettings.transferOwnership}
        description={t.projectSettings.transferOwnershipDesc}
      >
        <div className="rounded-lg border px-5 py-4">
          <Stack gap="sm">
            {otherMembers.length === 0 ? (
              <Text variant="caption" className="opacity-60">{t.projectSettings.noOtherMembers}</Text>
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
                  <Stack gap="sm">
                    <Text variant="caption">
                      {t.projectSettings.typeToConfirm.split("{name}")[0]}<strong>{name}</strong>{t.projectSettings.typeToConfirm.split("{name}")[1]}
                    </Text>
                    <Input
                      value={transferConfirm}
                      onChange={(e) => setTransferConfirm(e.target.value)}
                      placeholder={name}
                      className="text-sm"
                    />
                    <LoadingButton
                      size="sm"
                      variant="outline"
                      onClick={handleTransfer}
                      disabled={transferConfirm !== name}
                      loading={transferring}
                    >
                      {t.projectSettings.transferOwnership}
                    </LoadingButton>
                  </Stack>
                )}
              </>
            )}
          </Stack>
        </div>
      </SectionCard>

      {/* Delete Project */}
      <SectionCard
        title={t.projectSettings.deleteProject}
        description={t.projectSettings.deleteProjectDesc}
        variant="destructive"
      >
        <div className="rounded-lg border border-destructive/20 px-5 py-4">
          <Stack gap="sm">
            <Text variant="caption">
              {t.projectSettings.typeToConfirm.split("{name}")[0]}<strong>{name}</strong>{t.projectSettings.typeToConfirm.split("{name}")[1]}
            </Text>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={name}
              className="text-sm"
            />
            <LoadingButton
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteConfirm !== name}
              loading={deleting}
            >
              {t.projectSettings.deleteProject}
            </LoadingButton>
          </Stack>
        </div>
      </SectionCard>
    </Stack>
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
      .then((data) => setConnectors(data.items || []))
      .catch((e) => logger.error("agent tab load connectors failed", e))
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      apiFetch(`/api/connectors?projectId=${projectId}`)
        .then((r) => r.json())
        .then((data) => setConnectors(data.items || []))
        .catch((e) => logger.error("agent tab poll connectors failed", e));
    }, 10000);
    return () => clearInterval(interval);
  }, [projectId]);

  return (
    <Stack gap="lg">
      <SectionCard title={t.projectSettings.connectedAgents}>
        {loading ? (
          <Text variant="caption">{t.common.loading}</Text>
        ) : connectors.length === 0 ? (
          <div className="rounded-lg border border-dashed px-5 py-8 text-center">
            <Text variant="body" className="mb-1">{t.projectSettings.noAgentsConnected}</Text>
            <Text variant="caption" className="opacity-60">
              {t.projectSettings.noAgentsConnectedDesc}
            </Text>
          </div>
        ) : (
          <Stack gap="xs">
            {connectors.map((c: any) => (
              <div
                key={c.userId}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <Inline gap="md">
                  {c.status === "online" ? (
                    <span className="h-2 w-2 rounded-full bg-[#10b981]" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                  )}
                  <div>
                    <Text variant="body" className="font-medium">{c.userName}</Text>
                    <Text variant="caption" className="text-[10px]">
                      {c.agentType} · {c.status}
                    </Text>
                  </div>
                </Inline>
              </div>
            ))}
          </Stack>
        )}
      </SectionCard>

      <SectionCard
        title={t.projectSettings.setupGuide}
        description={t.projectSettings.setupGuideDesc}
      >
        <Stack gap="sm">
          <pre className="overflow-x-auto rounded-lg border bg-muted p-3 font-mono text-xs leading-relaxed text-foreground/80">
            <code>{`pip install phoenix-connector
phoenix-connector --key=pc_... --agent=http://localhost:2024 --project=${name}`}</code>
          </pre>
          <Text variant="caption" className="opacity-60">
            {t.projectSettings.connectorKeyHint}
          </Text>
        </Stack>
      </SectionCard>
    </Stack>
  );
}
