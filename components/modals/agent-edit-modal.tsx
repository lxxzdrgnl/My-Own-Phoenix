"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { ModalForm } from "@/components/ui/modal-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormLabel } from "@/components/ui/form-field";
import { AGENT_TYPES } from "@/lib/constants";
import { apiFetch } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import type { AgentEntry } from "@/app/settings/agents-section";

export function AgentEditModal({
  open,
  onClose,
  agent,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  agent?: AgentEntry;
  onSaved?: () => void;
}) {
  const t = useT();
  const mode = agent ? "edit" : "create";

  const [name, setName] = useState(agent?.name ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [agentType, setAgentType] = useState(agent?.agentType ?? "langgraph");
  const [endpoint, setEndpoint] = useState(agent?.endpoint ?? "http://localhost:2024");
  const [assistantId, setAssistantId] = useState(agent?.assistantId ?? "agent");
  const [evalHallucination, setEvalHallucination] = useState("");
  const [evalCitation, setEvalCitation] = useState("");
  const [evalToolCalling, setEvalToolCalling] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setName(agent?.name ?? "");
    setDescription(agent?.description ?? "");
    setAgentType(agent?.agentType ?? "langgraph");
    setEndpoint(agent?.endpoint ?? "http://localhost:2024");
    setAssistantId(agent?.assistantId ?? "agent");
    setEvalHallucination("");
    setEvalCitation("");
    setEvalToolCalling("");
    setError(undefined);

    if (agent?.evalPrompts) {
      try {
        const p = JSON.parse(agent.evalPrompts);
        setEvalHallucination(p.hallucination ?? "");
        setEvalCitation(p.citation ?? "");
        setEvalToolCalling(p.tool_calling ?? "");
      } catch {
        // evalPrompts 파싱 실패 시 빈값 유지
      }
    }
  }, [agent, open]);

  async function handleSubmit() {
    if (!name.trim()) { setError(`${t.settings.agentName} required.`); return; }
    if (!endpoint.trim()) { setError(`${t.settings.endpointUrl} required.`); return; }
    setError(undefined);
    setSaving(true);

    const evalPrompts: Record<string, string> = {};
    if (evalHallucination.trim()) evalPrompts.hallucination = evalHallucination.trim();
    if (evalCitation.trim()) evalPrompts.citation = evalCitation.trim();
    if (evalToolCalling.trim()) evalPrompts.tool_calling = evalToolCalling.trim();

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        agentType,
        endpoint: endpoint.trim(),
        assistantId: assistantId.trim(),
        evalPrompts,
      };
      if (mode === "edit" && agent?.id) body.id = agent.id;

      const res = await apiFetch("/api/agent-templates", {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Failed to save.");
        return;
      }
      onSaved?.();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  const title =
    mode === "create"
      ? t.settings.registerAgent
      : `${t.settings.editAgent}: ${agent?.name}`;

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={title}
      saving={saving}
      error={error}
      submitLabel={
        saving
          ? t.settings.saving
          : mode === "create"
          ? t.settings.register
          : t.common.save
      }
      cancelLabel={t.common.cancel}
      size="md"
    >
      <div className="space-y-4">
        <div>
          <FormLabel>{t.settings.agentName}</FormLabel>
          <Input
            placeholder="e.g. Legal RAG, Dexter"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={mode === "edit"}
          />
        </div>
        <div>
          <FormLabel>{t.settings.description}</FormLabel>
          <Input
            placeholder="Short description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FormLabel>{t.settings.agentType}</FormLabel>
            <select
              value={agentType}
              onChange={(e) => setAgentType(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              {AGENT_TYPES.map((at) => (
                <option key={at.value} value={at.value}>
                  {at.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FormLabel>{t.settings.assistantId}</FormLabel>
            <Input
              placeholder="agent"
              value={assistantId}
              onChange={(e) => setAssistantId(e.target.value)}
            />
          </div>
        </div>
        <div>
          <FormLabel>{t.settings.endpointUrl}</FormLabel>
          <Input
            placeholder="http://localhost:2024"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
          />
        </div>
        <div className="border-t pt-4">
          <p className="text-sm font-medium mb-2">{t.settings.evalPrompts}</p>
          <p className="text-xs text-muted-foreground mb-3">
            {t.settings.evalPromptsDesc} {"{{context}}"}, {"{{response}}"},{" "}
            {"{{query}}"}.
          </p>
          <div className="space-y-3">
            <div>
              <FormLabel>{t.settings.hallucination}</FormLabel>
              <Textarea
                rows={3}
                placeholder="Default"
                value={evalHallucination}
                onChange={(e) => setEvalHallucination(e.target.value)}
              />
            </div>
            <div>
              <FormLabel>{t.settings.citation}</FormLabel>
              <Textarea
                rows={3}
                placeholder="Default"
                value={evalCitation}
                onChange={(e) => setEvalCitation(e.target.value)}
              />
            </div>
            <div>
              <FormLabel>{t.settings.toolCalling}</FormLabel>
              <Textarea
                rows={3}
                placeholder="Default"
                value={evalToolCalling}
                onChange={(e) => setEvalToolCalling(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </ModalForm>
  );
}
