"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  type EvalFormConfig,
  type ScoreRange,
  generatePromptFromConfig,
  parsePromptToConfig,
  canParseAsForm,
  DEFAULT_FORM_CONFIG,
} from "./types";
import { RawModeView } from "./raw-mode-view";
import { RoleTaskSection } from "./role-task-section";
import { InputFieldsSection } from "./input-fields-section";
import { OutputModeSection } from "./output-mode-section";
import { ScoreRangesSection } from "./score-ranges-section";
import { BadgePreviewSection } from "./badge-preview-section";

// ─── Component ────────────────────────────────────────────────────────────

interface PromptBuilderProps {
  template: string;
  evalName: string;
  badgeLabel?: string;
  onChange: (template: string) => void;
  onBadgeLabelChange?: (label: string) => void;
}

export function PromptBuilder({ template, evalName, badgeLabel = "", onChange, onBadgeLabelChange }: PromptBuilderProps) {
  const t = useT();
  const [mode, setMode] = useState<"form" | "raw">(() => canParseAsForm(template) ? "form" : "raw");
  const [config, setConfig] = useState<EvalFormConfig>(() => {
    return parsePromptToConfig(template) ?? DEFAULT_FORM_CONFIG;
  });
  const [lastExternalTemplate, setLastExternalTemplate] = useState(template);

  // Re-initialize only when template changes externally (not from our own onChange)
  if (template !== lastExternalTemplate) {
    const generated = generatePromptFromConfig(config);
    if (template !== generated) {
      const parsed = parsePromptToConfig(template);
      if (parsed) {
        setConfig(parsed);
        setMode("form");
      } else {
        setMode("raw");
      }
    }
    setLastExternalTemplate(template);
  }

  const updateConfig = useCallback(
    (partial: Partial<EvalFormConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...partial };
        // Schedule onChange to avoid setState-during-render
        queueMicrotask(() => onChange(generatePromptFromConfig(next)));
        return next;
      });
    },
    [onChange],
  );

  // ── Score range helpers ──

  function addScoreRange() {
    const id = String(Date.now());
    updateConfig({
      scoreRanges: [
        ...config.scoreRanges,
        { id, min: 0, max: 0, label: "", meaning: "" },
      ],
    });
  }

  function updateScoreRange(id: string, partial: Partial<ScoreRange>) {
    updateConfig({
      scoreRanges: config.scoreRanges.map((r) =>
        r.id === id ? { ...r, ...partial } : r,
      ),
    });
  }

  function removeScoreRange(id: string) {
    if (config.scoreRanges.length <= 2) return;
    updateConfig({
      scoreRanges: config.scoreRanges.filter((r) => r.id !== id),
    });
  }

  // ── Input field toggle ──

  function toggleInputField(field: "context" | "query" | "response") {
    const fields = config.inputFields.includes(field)
      ? config.inputFields.filter((f) => f !== field)
      : [...config.inputFields, field];
    updateConfig({ inputFields: fields });
  }

  // ── Render ──

  if (mode === "raw") {
    return (
      <RawModeView
        template={template}
        onChange={onChange}
        onSwitchToForm={() => {
          const parsed = parsePromptToConfig(template);
          if (parsed) setConfig(parsed);
          setMode("form");
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {t.promptBuilder.evalConfig}
        </label>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMode("raw")}
          className="gap-1.5 text-[11px] h-6"
        >
          <Pencil className="size-3" /> {t.promptBuilder.editRawPrompt}
        </Button>
      </div>

      <RoleTaskSection config={config} onUpdate={updateConfig} />

      <InputFieldsSection config={config} onToggle={toggleInputField} />

      <OutputModeSection config={config} onUpdate={updateConfig} />

      {config.outputMode === "score" && (
        <ScoreRangesSection
          config={config}
          onAddRange={addScoreRange}
          onUpdateRange={updateScoreRange}
          onRemoveRange={removeScoreRange}
        />
      )}

      <BadgePreviewSection
        config={config}
        evalName={evalName}
        badgeLabel={badgeLabel}
        onBadgeLabelChange={onBadgeLabelChange}
      />

      {/* ── Generated Prompt Preview ── */}
      <details className="rounded-lg border">
        <summary className="cursor-pointer px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/20 transition-colors">
          {t.promptBuilder.previewGeneratedPrompt}
        </summary>
        <div className="border-t px-4 py-3">
          <pre className="whitespace-pre-wrap text-xs font-mono text-muted-foreground leading-relaxed">
            {generatePromptFromConfig(config)}
          </pre>
        </div>
      </details>
    </div>
  );
}
