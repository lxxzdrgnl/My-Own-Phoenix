"use client";

import { logger } from "@/lib/logger";
import { useEffect, useState, useCallback } from "react";
import {
  fetchPromptVersionTags,
  addPromptVersionTag,
  deletePromptVersionTag,
  createPrompt,
  updatePrompt,
  deletePrompt,
  normalizeContent,
  PromptVersion,
  PromptInfo,
  PromptTag,
} from "@/lib/phoenix";
import { apiFetch } from "@/lib/api-client";
import { useFormSubmit } from "@/lib/hooks/use-form-submit";
import {
  Plus,
  Tag,
  Pencil,
  Trash2,
  X,
  ChevronRight,
  ChevronDown,
  MessageSquare,
} from "lucide-react";
import { ModelSelector } from "@/components/model-selector";
import { ModalShell, ModalHeader, ModalBody } from "@/components/ui/modal-shell";
import { ModalForm } from "@/components/ui/modal-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormLabel } from "@/components/ui/form-field";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n";

interface VersionWithTags extends PromptVersion {
  tags: PromptTag[];
}

interface PromptWithVersions {
  info: PromptInfo;
  versions: VersionWithTags[];
}

interface PromptsModalProps {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  /** DB project id — required: this modal only ever lists prompts that belong to a specific project. */
  projectId: string;
}

export function PromptsModal({ open, onClose, onChanged, projectId }: PromptsModalProps) {
  const t = useT();
  const [prompts, setPrompts] = useState<PromptWithVersions[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [innerModal, setInnerModal] = useState<null | "create" | "edit">(null);
  const [editTarget, setEditTarget] = useState<PromptFormInitial | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/prompts`);
      const data = await res.json();
      const scoped: Array<{ prompt: PromptInfo; versions: PromptVersion[] }> = data.prompts ?? [];
      const result: PromptWithVersions[] = [];
      for (const { prompt: p, versions } of scoped) {
        const versionsWithTags: VersionWithTags[] = [];
        for (const v of versions) {
          const tags = await fetchPromptVersionTags(v.id);
          versionsWithTags.push({ ...v, tags });
        }
        result.push({ info: p, versions: versionsWithTags });
      }
      setPrompts(result);
    } catch (e) {
      logger.error("prompts-modal load prompts failed", e);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function handleDelete(name: string) {
    const ok = await confirm({
      title: t.promptsModal.deletePrompt,
      description: `This will permanently delete "${name}" and all its versions.`,
      confirmText: t.common.delete,
    });
    if (!ok) return;
    try {
      await deletePrompt(name);
      // Best-effort: remove the project mapping too. The Phoenix delete already
      // ran, so a failure here only leaves an orphan mapping row that the
      // GET endpoint will quietly skip on the next load.
      await apiFetch(
        `/api/projects/${encodeURIComponent(projectId)}/prompts?name=${encodeURIComponent(name)}`,
        { method: "DELETE" },
      ).catch((e) => logger.error("prompts-modal mapping delete failed", e));
      await load();
      onChanged?.();
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    }
  }

  function handleEdit(p: PromptWithVersions) {
    const latest = p.versions[0];
    const msgs = latest?.template?.messages ?? [];
    setEditTarget({
      name: p.info.name,
      description: p.info.description ?? "",
      system: normalizeContent(msgs.find((m) => m.role === "system")?.content ?? ""),
      user: normalizeContent(msgs.find((m) => m.role === "user")?.content ?? "{{query}}"),
      model: latest?.model_name ?? "gpt-4o-mini",
      temperature: latest?.invocation_parameters?.openai?.temperature ?? 0.7,
    });
    setInnerModal("edit");
  }

  function handleInnerSave() {
    load();
    onChanged?.();
  }

  return (
    <ModalShell open={open} onClose={onClose} size="lg">
      <ModalHeader title={t.promptsModal.title} />
      <ModalBody>
        <button
          onClick={() => setInnerModal("create")}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          {t.promptsModal.newPrompt}
        </button>

        {loading && <LoadingState />}

        {!loading && prompts.length === 0 && (
          <EmptyState icon={MessageSquare} title={t.promptsModal.noPromptsYet} />
        )}

        <div className="flex flex-col gap-2">
          {prompts.map((p) => (
            <div key={p.info.id} className="rounded-lg border">
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() =>
                    setExpanded(expanded === p.info.name ? null : p.info.name)
                  }
                  className="rounded p-0.5 hover:bg-muted"
                >
                  {expanded === p.info.name ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{String(p.info.name)}</p>
                  {p.info.description && typeof p.info.description === "string" && (
                    <p className="truncate text-xs text-muted-foreground">
                      {p.info.description}
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {p.versions.length} ver
                </span>
                <button
                  onClick={() => handleEdit(p)}
                  className="rounded p-1.5 transition-colors hover:bg-muted"
                  title={t.promptsModal.addNewVersion}
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={() => handleDelete(p.info.name)}
                  className="rounded p-1.5 transition-colors hover:bg-red-500/10"
                  title={t.common.delete}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>

              {expanded === p.info.name && (
                <div className="border-t">
                  {p.versions.map((v, i) => (
                    <div key={v.id} className="border-b last:border-b-0 px-4 py-3">
                      <div className="mb-2 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {String(v.description || v.id)}
                        </span>
                        {i === 0 && (
                          <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-xs font-medium">
                            {t.promptsModal.latest}
                          </span>
                        )}
                        {v.tags.map((tag) => (
                          <span
                            key={tag.name}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                          >
                            <Tag className="h-2.5 w-2.5" />
                            {tag.name}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const ok = await confirm({
                                  title: "Delete tag",
                                  description: `Remove the "${tag.name}" tag from this version.`,
                                  confirmText: "Delete",
                                });
                                if (!ok) return;
                                try {
                                  await deletePromptVersionTag(v.id, tag.name);
                                  await load();
                                  onChanged?.();
                                } catch (err: any) {
                                  alert(err.message);
                                }
                              }}
                              className="ml-0.5 hover:text-foreground text-muted-foreground"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                        <button
                          onClick={async () => {
                            const name = prompt("Tag name (e.g. production, staging)");
                            if (!name?.trim()) return;
                            try {
                              await addPromptVersionTag(v.id, name.trim());
                              await load();
                              onChanged?.();
                            } catch (err: any) {
                              alert(err.message);
                            }
                          }}
                          className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                        >
                          + {t.promptsModal.tag}
                        </button>
                        <span className="text-xs text-muted-foreground">
                          {v.model_name} / temp{" "}
                          {v.invocation_parameters?.openai?.temperature ?? "N/A"}
                        </span>
                      </div>
                      {v.template?.messages?.map((m, mi) => (
                        <div key={mi} className="mb-2">
                          <span className="mb-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs font-semibold uppercase">
                            {m.role}
                          </span>
                          <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm leading-relaxed">
                            {normalizeContent(m.content)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ModalBody>

      {innerModal === "create" && (
        <PromptFormModal
          mode="create"
          projectId={projectId}
          onClose={() => setInnerModal(null)}
          onSave={handleInnerSave}
        />
      )}
      {innerModal === "edit" && editTarget && (
        <PromptFormModal
          mode="edit"
          projectId={projectId}
          initial={editTarget}
          onClose={() => {
            setInnerModal(null);
            setEditTarget(null);
          }}
          onSave={handleInnerSave}
        />
      )}
    </ModalShell>
  );
}

/* ── Shared Prompt Form Modal ─────────────────────────────────── */

export interface PromptFormInitial {
  name: string;
  description: string;
  system: string;
  user: string;
  model: string;
  temperature: number;
}

interface PromptFormModalProps {
  mode: "create" | "edit";
  initial?: PromptFormInitial;
  onClose: () => void;
  onSave: () => void;
  /** DB project id to scope newly created prompts to. Required for `create` mode — Phoenix prompts must be project-scoped. */
  projectId?: string;
}

export function PromptFormModal({
  mode,
  initial,
  onClose,
  onSave,
  projectId,
}: PromptFormModalProps) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [system, setSystem] = useState(initial?.system ?? "");
  const [user, setUser] = useState(initial?.user ?? "{{query}}");
  const [model, setModel] = useState(initial?.model ?? "gpt-4o-mini");
  const [temperature, setTemperature] = useState(initial?.temperature ?? 0.7);
  const [versionDesc, setVersionDesc] = useState("");

  const endpoint =
    mode === "create"
      ? `/api/projects/${encodeURIComponent(projectId ?? "")}/prompts`
      : `/api/projects/${encodeURIComponent(projectId ?? "")}/prompts`;
  const { submit, saving, error, setError } = useFormSubmit<{ phoenixName: string }>(
    endpoint,
    "POST",
    { onSuccess: () => { onSave(); onClose(); } },
  );

  async function handleSave() {
    if (!name.trim() || !system.trim()) {
      setError(t.promptsModal.nameRequired);
      return;
    }
    if (mode === "create" && !projectId) {
      setError("Project context is required to create a prompt.");
      return;
    }

    if (mode === "create") {
      try {
        await createPrompt(name, desc, system, user, model, temperature);
      } catch (e: any) {
        setError(e.message);
        return;
      }
      // Register the prompt under the current project so it shows up in this
      // project's playground and stays hidden from others. Phoenix names are
      // global, so this mapping is the only enforcement of project scoping.
      await submit({ phoenixName: name });
    } else {
      try {
        await updatePrompt(name, desc, versionDesc || `v${Date.now()}`, system, user, model, temperature);
        onSave();
        onClose();
      } catch (e: any) {
        setError(e.message);
      }
    }
  }

  return (
    <ModalForm
      open
      onClose={onClose}
      onSubmit={handleSave}
      title={mode === "create" ? t.promptsModal.newPrompt : `${t.common.edit}: ${name}`}
      saving={saving}
      error={error || null}
      submitLabel={mode === "create" ? t.common.create : t.promptsModal.saveNewVersion}
      cancelLabel={t.common.cancel}
      size="md"
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <FormLabel>{t.promptsModal.model}</FormLabel>
            <ModelSelector value={model} onChange={setModel} />
          </div>
          <div className="w-28">
            <FormLabel>{t.promptsModal.temperature}</FormLabel>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <FormLabel>{t.promptsModal.name}</FormLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mode === "edit"}
              placeholder="my-prompt"
            />
          </div>
          <div className="flex-1">
            <FormLabel>{t.promptsModal.description}</FormLabel>
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={t.promptsModal.description}
            />
          </div>
        </div>
        {mode === "edit" && (
          <div>
            <FormLabel>{t.promptsModal.versionLabel}</FormLabel>
            <Input
              value={versionDesc}
              onChange={(e) => setVersionDesc(e.target.value)}
              placeholder="e.g. v2 - add citation format"
            />
          </div>
        )}
        <div>
          <FormLabel>{t.promptsModal.systemPrompt}</FormLabel>
          <Textarea
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            rows={10}
            placeholder="You are a Korean legal AI assistant..."
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t.promptsModal.templateVarsHint}
          </p>
        </div>
        <div>
          <FormLabel>{t.promptsModal.userTemplate}</FormLabel>
          <Input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="{{query}}"
          />
        </div>
      </div>
    </ModalForm>
  );
}
