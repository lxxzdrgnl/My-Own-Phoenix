"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchPromptVersionTags,
  addPromptVersionTag,
  deletePromptVersionTag,
  deletePrompt,
  normalizeContent,
  PromptVersion,
  PromptInfo,
  PromptTag,
} from "@/lib/phoenix";
import { apiFetch } from "@/lib/api-client";
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
import { Nav } from "@/components/nav";
import { PromptFormModal, PromptFormInitial } from "@/components/modals/prompts-modal";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useResourceList } from "@/lib/hooks/use-resource-list";

interface VersionWithTags extends PromptVersion {
  tags: PromptTag[];
}

interface PromptWithVersions {
  info: PromptInfo;
  versions: VersionWithTags[];
}

export function PromptsManager({ projectId }: { projectId: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "create" | "edit">(null);
  const [editTarget, setEditTarget] = useState<PromptFormInitial | null>(null);
  const confirm = useConfirm();

  const enrichingRef = useRef(false);

  const {
    items: prompts,
    setItems: setPrompts,
    loading,
    reload,
  } = useResourceList<PromptWithVersions>(
    `/api/projects/${encodeURIComponent(projectId)}/prompts`,
    {
      transform: (data) => {
        const scoped: Array<{ prompt: PromptInfo; versions: PromptVersion[] }> =
          data.prompts ?? [];
        return scoped.map(({ prompt: p, versions }) => ({
          info: p,
          versions: versions.map((v) => ({ ...v, tags: [] })),
        }));
      },
    },
  );

  // tag 보강: prompts 로드 완료 후 각 버전의 태그를 비동기로 채움
  useEffect(() => {
    if (loading || prompts.length === 0) return;
    if (enrichingRef.current) return;
    enrichingRef.current = true;

    (async () => {
      try {
        const enriched = await Promise.all(
          prompts.map(async (p) => {
            const versionsWithTags = await Promise.all(
              p.versions.map(async (v) => {
                if (v.tags.length > 0) return v;
                const tags = await fetchPromptVersionTags(v.id);
                return { ...v, tags };
              }),
            );
            return { ...p, versions: versionsWithTags };
          }),
        );
        setPrompts(enriched);
      } catch (e) {
        // logger 사용 대신 태그 보강 실패는 조용히 무시 (tags는 non-critical)
      } finally {
        enrichingRef.current = false;
      }
    })();
  // prompts 객체 자체가 바뀔 때만 실행 (loading 완료 시점)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const load = useCallback(async () => {
    enrichingRef.current = false;
    await reload();
  }, [reload]);

  async function handleDelete(name: string) {
    const ok = await confirm({
      title: "Delete prompt",
      description: `This will permanently delete "${name}" and all its versions.`,
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await deletePrompt(name);
      await apiFetch(
        `/api/projects/${encodeURIComponent(projectId)}/prompts?name=${encodeURIComponent(name)}`,
        { method: "DELETE" },
      ).catch((e) => console.error("[prompts] mapping delete failed:", e));
      await load();
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
    setModal("edit");
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Nav />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          <button
            onClick={() => setModal("create")}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-4 text-base text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            New Prompt
          </button>

          {loading && <LoadingState className="py-20" />}

          {!loading && prompts.length === 0 && (
            <EmptyState
              icon={MessageSquare}
              title="No prompts yet"
              description="Create your first prompt using the button above"
              className="py-20"
            />
          )}

          <div className="flex flex-col gap-3">
            {prompts.map((p) => (
              <div key={p.info.id} className="rounded-lg border">
                <div className="flex items-center gap-3 px-4 py-3.5">
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
                    <p className="text-base font-medium">{String(p.info.name)}</p>
                    {p.info.description && typeof p.info.description === "string" && (
                      <p className="truncate text-sm text-muted-foreground">
                        {p.info.description}
                      </p>
                    )}
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    {p.versions.length} version
                    {p.versions.length !== 1 && "s"}
                  </span>
                  <button
                    onClick={() => handleEdit(p)}
                    className="rounded p-1.5 transition-colors hover:bg-muted"
                    title="Add new version"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => handleDelete(p.info.name)}
                    className="rounded p-1.5 transition-colors hover:bg-red-500/10"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>

                {expanded === p.info.name && (
                  <div className="border-t">
                    {p.versions.map((v, i) => (
                      <div key={v.id} className="border-b last:border-b-0 px-4 py-3.5">
                        <div className="mb-2.5 flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {String(v.description || v.id)}
                          </span>
                          {i === 0 && (
                            <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-xs font-medium">
                              latest
                            </span>
                          )}
                          {v.tags.map((tag) => (
                            <span key={tag.name} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium">
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
                                  try { await deletePromptVersionTag(v.id, tag.name); await load(); }
                                  catch (err: any) { alert(err.message); }
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
                              try { await addPromptVersionTag(v.id, name.trim()); await load(); }
                              catch (err: any) { alert(err.message); }
                            }}
                            className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                          >
                            + tag
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
                            <div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm leading-relaxed">
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
        </div>
      </div>

      {modal === "create" && (
        <PromptFormModal
          mode="create"
          projectId={projectId}
          onClose={() => setModal(null)}
          onSave={load}
        />
      )}
      {modal === "edit" && editTarget && (
        <PromptFormModal
          mode="edit"
          projectId={projectId}
          initial={editTarget}
          onClose={() => {
            setModal(null);
            setEditTarget(null);
          }}
          onSave={load}
        />
      )}
    </div>
  );
}
