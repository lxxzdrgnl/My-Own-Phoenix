"use client";
import { apiFetch } from "@/lib/api-client";

import { useState } from "react";
import {
  Plus, Pencil, Trash2, ChevronRight, ChevronDown, Bot,
} from "lucide-react";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n";
import { AgentEditModal } from "@/components/modals/agent-edit-modal";
import { useResourceList } from "@/lib/hooks/use-resource-list";
import { Heading } from "@/components/ui/typography";
import { Stack } from "@/components/ui/stack";

export interface AgentEntry {
  id: string;
  name: string;
  description: string;
  agentType: string;
  endpoint: string;
  assistantId: string;
  evalPrompts: string;
}

export function AgentsSection() {
  const t = useT();
  const { items: agents, loading, reload } = useResourceList<AgentEntry>(
    "/api/agent-templates",
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<AgentEntry | null>(null);
  const confirm = useConfirm();

  async function handleDelete(agent: AgentEntry) {
    const ok = await confirm({
      title: t.settings.deleteAgent,
      description: `"${agent.name}" ${t.settings.deleteAgentDesc}`,
      confirmText: t.common.delete,
    });
    if (!ok) return;
    await apiFetch(`/api/agent-templates?id=${agent.id}`, { method: "DELETE" });
    await reload();
  }

  function parseEvalPrompts(raw: string): Record<string, string> {
    try { return JSON.parse(raw); } catch { return {}; }
  }

  return (
    <div>
      {/* Header */}
      <Stack gap="xs" className="mb-8">
        <Heading level="section">{t.settings.agentsTitle}</Heading>
        <p className="text-sm text-muted-foreground">{t.settings.agentsDesc}</p>
      </Stack>

      {loading && <LoadingState />}

      {!loading && (
        <div className="space-y-8">
          {/* Agent list */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Heading level="sub">{t.settings.templates}</Heading>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {agents.length}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-2">
              {agents.map((a) => {
                const isExpanded = expanded === a.id;
                const prompts = parseEvalPrompts(a.evalPrompts);
                const promptKeys = Object.keys(prompts).filter((k) => prompts[k]);

                return (
                  <div key={a.id} className="rounded-lg border transition-colors hover:border-foreground/15">
                    {/* Header row */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button
                        onClick={() => setExpanded(isExpanded ? null : a.id)}
                        className="rounded p-0.5 hover:bg-muted"
                      >
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground/50" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                        }
                      </button>
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                        {a.name.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{a.name}</p>
                        {a.description && (
                          <p className="truncate text-[11px] text-muted-foreground/60">{a.description}</p>
                        )}
                      </div>
                      <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-[10px] font-semibold text-foreground/60">
                        {a.agentType}
                      </span>
                      {promptKeys.length > 0 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground/60">
                          {promptKeys.length} evals
                        </span>
                      )}
                      <button
                        onClick={() => { setEditTarget(a); setShowForm(true); }}
                        className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(a)}
                        className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t bg-muted/5 px-4 py-3 space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Heading level="sub">{t.settings.endpoint}</Heading>
                            <p className="mt-1 font-mono text-xs text-foreground/80 break-all">{a.endpoint}</p>
                          </div>
                          <div>
                            <Heading level="sub">{t.settings.assistantId}</Heading>
                            <p className="mt-1 font-mono text-xs text-foreground/80">{a.assistantId}</p>
                          </div>
                        </div>

                        {promptKeys.length > 0 && (
                          <div>
                            <Heading level="sub">{t.settings.evalPrompts}</Heading>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {promptKeys.map((key) => (
                                <span key={key} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                  {key}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {agents.length === 0 && (
                <EmptyState icon={Bot} title={t.settings.noAgentsTitle} description={t.settings.noAgentsDesc} />
              )}

              <button
                onClick={() => { setEditTarget(null); setShowForm(true); }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-muted-foreground/60 transition-colors hover:border-foreground/20 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                {t.settings.registerNewAgent}
              </button>
            </div>
          </section>
        </div>
      )}

      <AgentEditModal
        open={showForm}
        onClose={() => { setShowForm(false); setEditTarget(null); }}
        agent={editTarget ?? undefined}
        onSaved={() => { setShowForm(false); setEditTarget(null); reload(); }}
      />
    </div>
  );
}
