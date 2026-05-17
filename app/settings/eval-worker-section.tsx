"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/empty-state";
import { CheckCircle, Loader2 } from "lucide-react";
import { ModelSelector } from "@/components/model-selector";
import { useSettingsForm } from "@/lib/hooks";
import { useT } from "@/lib/i18n";

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
        <h2 className="text-xl font-semibold tracking-tight">{t.settings.evalWorker}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t.settings.evalWorkerDesc}
        </p>
      </div>

      {loading && <LoadingState />}

      {!loading && (
        <div className="space-y-8">
          {/* Worker Status */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                {t.settings.status}
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="rounded-lg border bg-muted/5 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{t.settings.worker}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      isEnabled ? "bg-[#10b981] text-white" : "bg-muted text-muted-foreground"
                    }`}>
                      {isEnabled ? t.settings.running : t.settings.paused}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isEnabled
                      ? t.settings.workerRunningDesc
                      : t.settings.workerPausedDesc}
                  </p>
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
          </section>

          {/* Configuration */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                {t.settings.configuration}
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2">
              {/* Default Eval Model */}
              <div className="rounded-lg border px-5 py-4">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="text-sm font-medium">{t.settings.defaultModel}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.settings.defaultModelDesc}
                    </p>
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
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.settings.pollingIntervalDesc}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={5}
                      max={300}
                      value={settings.evalPollInterval}
                      onChange={(e) => update("evalPollInterval", e.target.value)}
                      className="w-20 text-center text-sm tabular-nums"
                    />
                    <span className="text-xs text-muted-foreground/60">sec</span>
                  </div>
                </div>
              </div>

              {/* Lookback Window */}
              <div className="rounded-lg border px-5 py-4">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="text-sm font-medium">{t.settings.lookbackWindow}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.settings.lookbackWindowDesc}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      value={settings.evalLookbackMinutes}
                      onChange={(e) => update("evalLookbackMinutes", e.target.value)}
                      className="w-20 text-center text-sm tabular-nums"
                    />
                    <span className="text-xs text-muted-foreground/60">min</span>
                  </div>
                </div>
              </div>

              {/* Max LLM Evals Per Trace */}
              <div className="rounded-lg border px-5 py-4">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="text-sm font-medium">{t.settings.maxLlmEvalsPerTrace}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.settings.maxLlmEvalsPerTraceDesc}
                    </p>
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
            </div>
          </section>

          {/* Save bar */}
          <div className="flex items-center gap-3 border-t pt-5">
            <Button onClick={save} disabled={saving || !dirty} size="sm">
              {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              {t.settings.saveChanges}
            </Button>
            {saved && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-[#10b981]" />
                {t.settings.savedRestart}
              </span>
            )}
            {dirty && !saved && (
              <span className="text-xs text-muted-foreground/50">{t.settings.unsavedChanges}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
