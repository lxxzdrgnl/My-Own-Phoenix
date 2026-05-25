"use client";

import { useState, useCallback, useEffect } from "react";
import { Bot, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n";
import { Heading } from "@/components/ui/typography";
import { AgentConfig, AgentTemplate } from "./chat-types";
import { ProjectCard } from "./chat-project-list";
import { AddProjectForm } from "./chat-add-form";

export function ChatSection() {
  const t = useT();
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
      title: t.settings.disconnectAgent,
      description: `${t.settings.disconnectAgentDesc} "${project}".`,
      confirmText: t.settings.disconnect,
    });
    if (!ok) return;
    await apiFetch(`/api/agent-config?project=${encodeURIComponent(project)}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <div className="mb-8">
        <Heading level="section">{t.settings.chatTitle}</Heading>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t.settings.chatDesc}
        </p>
      </div>

      {loading && <LoadingState />}

      {!loading && (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Heading level="sub">{t.settings.projectAgentMapping}</Heading>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {configs.length}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {configs.length === 0 && !showAddForm && (
              <EmptyState
                icon={Bot}
                title={t.settings.noConnections}
                description={t.settings.noConnectionsDesc}
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
                  {t.settings.connectProject}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
