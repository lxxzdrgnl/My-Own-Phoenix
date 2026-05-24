"use client";

import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/empty-state";
import { CheckCircle } from "lucide-react";
import { ModelSelector } from "@/components/model-selector";
import { useSettingsForm } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { Heading, Text } from "@/components/ui/typography";
import { Stack, Inline } from "@/components/ui/stack";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingButton } from "@/components/ui/loading-button";

const DEFAULTS = {
  evalWorkerEnabled: "true",
  evalPollInterval: "15",
  evalMaxLlmPerTrace: "5",
  evalLookbackMinutes: "5",
  defaultEvalModel: "gpt-4o-mini",
};

export function EvalWorkerSection() {
  const t = useT();
  const { settings, loading, saving, saved, dirty, update, save } = useSettingsForm(DEFAULTS);

  const isEnabled = settings.evalWorkerEnabled === "true";

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Heading level="section">{t.settings.evalWorker}</Heading>
        <Text variant="caption" className="mt-1.5">
          {t.settings.evalWorkerDesc}
        </Text>
      </div>

      {loading && <LoadingState />}

      {!loading && (
        <Stack gap="xl">
          {/* Worker Status */}
          <SectionCard title={t.settings.status}>
            <div className="rounded-lg border bg-muted/5 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <Inline gap="sm">
                    <p className="text-sm font-medium">{t.settings.worker}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      isEnabled ? "bg-[#10b981] text-white" : "bg-muted text-muted-foreground"
                    }`}>
                      {isEnabled ? t.settings.running : t.settings.paused}
                    </span>
                  </Inline>
                  <Text variant="caption" className="mt-1">
                    {isEnabled
                      ? t.settings.workerRunningDesc
                      : t.settings.workerPausedDesc}
                  </Text>
                </div>
                <button
                  onClick={() => update("evalWorkerEnabled", isEnabled ? "false" : "true")}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                    isEnabled ? "bg-foreground" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-full bg-background shadow-sm transition-transform ${
                      isEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          </SectionCard>

          {/* Configuration */}
          <SectionCard title={t.settings.configuration}>
            <Stack gap="xs">
              {/* Default Eval Model */}
              <div className="rounded-lg border px-5 py-4">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="text-sm font-medium">{t.settings.defaultModel}</p>
                    <Text variant="caption" className="mt-0.5">
                      {t.settings.defaultModelDesc}
                    </Text>
                  </div>
                  <div className="w-56 shrink-0">
                    <ModelSelector
                      value={settings.defaultEvalModel}
                      onChange={(m) => update("defaultEvalModel", m)}
                    />
                  </div>
                </div>
              </div>

              {/* Polling Interval */}
              <div className="rounded-lg border px-5 py-4">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="text-sm font-medium">{t.settings.pollingInterval}</p>
                    <Text variant="caption" className="mt-0.5">
                      {t.settings.pollingIntervalDesc}
                    </Text>
                  </div>
                  <Inline gap="sm">
                    <Input
                      type="number"
                      min={5}
                      max={300}
                      value={settings.evalPollInterval}
                      onChange={(e) => update("evalPollInterval", e.target.value)}
                      className="w-20 text-center text-sm tabular-nums"
                    />
                    <Text variant="caption" as="span">sec</Text>
                  </Inline>
                </div>
              </div>

              {/* Lookback Window */}
              <div className="rounded-lg border px-5 py-4">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="text-sm font-medium">{t.settings.lookbackWindow}</p>
                    <Text variant="caption" className="mt-0.5">
                      {t.settings.lookbackWindowDesc}
                    </Text>
                  </div>
                  <Inline gap="sm">
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      value={settings.evalLookbackMinutes}
                      onChange={(e) => update("evalLookbackMinutes", e.target.value)}
                      className="w-20 text-center text-sm tabular-nums"
                    />
                    <Text variant="caption" as="span">min</Text>
                  </Inline>
                </div>
              </div>

              {/* Max LLM Evals Per Trace */}
              <div className="rounded-lg border px-5 py-4">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="text-sm font-medium">{t.settings.maxLlmEvalsPerTrace}</p>
                    <Text variant="caption" className="mt-0.5">
                      {t.settings.maxLlmEvalsPerTraceDesc}
                    </Text>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={settings.evalMaxLlmPerTrace}
                    onChange={(e) => update("evalMaxLlmPerTrace", e.target.value)}
                    className="w-20 text-center text-sm tabular-nums"
                  />
                </div>
              </div>
            </Stack>
          </SectionCard>

          {/* Save bar */}
          <Inline gap="sm" className="border-t pt-5">
            <LoadingButton
              onClick={save}
              disabled={!dirty}
              loading={saving}
              loadingText={t.settings.saveChanges}
              size="sm"
            >
              {t.settings.saveChanges}
            </LoadingButton>
            {saved && (
              <Inline gap="xs">
                <CheckCircle className="h-3.5 w-3.5 text-[#10b981]" />
                <Text variant="caption" as="span">{t.settings.savedRestart}</Text>
              </Inline>
            )}
            {dirty && !saved && (
              <Text variant="caption" as="span" className="text-muted-foreground/50">
                {t.settings.unsavedChanges}
              </Text>
            )}
          </Inline>
        </Stack>
      )}
    </div>
  );
}
