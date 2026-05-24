"use client";

import { useState } from "react";
import { normalizeContent, updatePrompt, PromptVersion } from "@/lib/phoenix";
import { ModalForm } from "@/components/ui/modal-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormLabel } from "@/components/ui/form-field";
import { ModelSelector } from "@/components/model-selector";
import { useT } from "@/lib/i18n";

interface Props {
  promptName: string;
  version: PromptVersion;
  onClose: () => void;
  onSave: () => void;
}

export function PromptEditModal({ promptName, version, onClose, onSave }: Props) {
  const t = useT();
  const msgs = version.template?.messages ?? [];

  const [desc, setDesc] = useState(version.description ?? "");
  const [system, setSystem] = useState(
    normalizeContent(msgs.find((m) => m.role === "system")?.content ?? ""),
  );
  const [user, setUser] = useState(
    normalizeContent(msgs.find((m) => m.role === "user")?.content ?? "{{query}}"),
  );
  const [model, setModel] = useState(version.model_name ?? "gpt-4o-mini");
  const [temperature, setTemperature] = useState(
    version.invocation_parameters?.openai?.temperature ?? 0.7,
  );
  const [versionDesc, setVersionDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!system.trim()) {
      setError(t.promptsModal.nameRequired);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updatePrompt(
        promptName,
        desc,
        versionDesc || `v${Date.now()}`,
        system,
        user,
        model,
        temperature,
      );
      onSave();
      onClose();
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  }

  return (
    <ModalForm
      open
      onClose={onClose}
      onSubmit={handleSubmit}
      title={`${t.common.edit}: ${promptName}`}
      saving={saving}
      error={error}
      submitLabel={t.promptsModal.saveNewVersion}
      submitDisabled={!system.trim()}
      size="lg"
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
            <Input value={promptName} disabled />
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

        <div>
          <FormLabel>{t.promptsModal.versionLabel}</FormLabel>
          <Input
            value={versionDesc}
            onChange={(e) => setVersionDesc(e.target.value)}
            placeholder="e.g. v2 - add citation format"
          />
        </div>

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
