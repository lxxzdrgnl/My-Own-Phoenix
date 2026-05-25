"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-field";
import { LoadingButton } from "@/components/ui/loading-button";
import { InlineError } from "@/components/ui/inline-error";
import { Heading } from "@/components/ui/typography";
import { useT } from "@/lib/i18n";
import { AgentTemplate } from "./chat-types";

// ── Add Project Form ──

export function AddProjectForm({
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
  const t = useT();
  const [project, setProject] = useState("");
  const [alias, setAlias] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const isDuplicate = project.trim() !== "" && existingProjects.includes(project.trim());

  const selectedTemplate = templates.find((tmpl) => tmpl.id === selectedTemplateId);

  async function handleSave() {
    if (!project.trim()) { setError(`${t.settings.projectNameLabel} required.`); return; }
    if (isDuplicate) { setError(`"${project.trim()}" ${t.settings.alreadyExists}`); return; }
    if (!selectedTemplateId) { setError(`${t.settings.selectAgent}`); return; }
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
        <Heading level="section" as="h4">{t.settings.newProjectConnection}</Heading>
        <button onClick={onCancel} className="rounded p-1 text-muted-foreground/40 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FormLabel>{t.settings.projectNameLabel}</FormLabel>
          <Input
            value={project}
            onChange={(e) => { setProject(e.target.value); setError(undefined); }}
            placeholder="e.g. legal-rag"
            className="text-xs"
          />
          {isDuplicate && (
            <p className="mt-1 text-[10px] text-destructive">{t.settings.alreadyExists}</p>
          )}
        </div>
        <div>
          <FormLabel>{t.settings.displayNameOptional}</FormLabel>
          <Input
            placeholder={project || "Alias"}
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            className="text-xs"
          />
        </div>
      </div>

      <div>
        <FormLabel>{t.settings.agent}</FormLabel>
        <select
          value={selectedTemplateId}
          onChange={(e) => setSelectedTemplateId(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">{t.settings.selectAgent}</option>
          {templates.map((tmpl) => (
            <option key={tmpl.id} value={tmpl.id}>
              {tmpl.name} {tmpl.description ? `— ${tmpl.description}` : ""}
            </option>
          ))}
        </select>
        {templates.length === 0 && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {t.settings.noAgentsRegistered}
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

      <InlineError>{error}</InlineError>

      <div className="flex items-center gap-2 border-t pt-3">
        <LoadingButton size="sm" className="text-xs" onClick={handleSave} loading={saving} loadingText={t.common.create} disabled={!project.trim() || isDuplicate || !selectedTemplateId}>
          {t.common.create}
        </LoadingButton>
        <Button variant="ghost" size="sm" className="text-xs" onClick={onCancel}>{t.common.cancel}</Button>
      </div>
    </div>
  );
}
