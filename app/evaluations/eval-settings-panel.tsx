"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import { useFormSubmit } from "@/lib/hooks/use-form-submit";
import { Zap, MessageSquare, CircleOff, Check, ArrowRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Heading, Text } from "@/components/ui/typography";
import { Stack } from "@/components/ui/stack";
import { UI_FEEDBACK_RESET_MS } from "@/lib/config/timeouts";

const SOURCE_IDS = ["auto", "system_prompt", "none"] as const;
type SourceId = (typeof SOURCE_IDS)[number];
const SOURCE_ICONS = { auto: Zap, system_prompt: MessageSquare, none: CircleOff } as const;

interface EvalSettingsPanelProps {
  projectId: string;
}

export function EvalSettingsPanel({ projectId }: EvalSettingsPanelProps) {
  const t = useT();
  const cs = t.evaluations.contextSources;
  const [contextSource, setContextSource] = useState<SourceId>("auto");
  const [saved, setSaved] = useState(false);
  const [hoveredId, setHoveredId] = useState<SourceId | null>(null);

  const { submit, saving } = useFormSubmit("/api/settings", "PUT", {
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), UI_FEEDBACK_RESET_MS);
    },
  });

  useEffect(() => {
    apiFetch(`/api/settings?scope=project&projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (SOURCE_IDS.includes(data.evalContextSource)) setContextSource(data.evalContextSource);
      })
      .catch(() => {});
  }, [projectId]);

  const handleSave = async (value: SourceId) => {
    if (value === contextSource) return;
    setContextSource(value);
    await submit({ key: "evalContextSource", value, scope: "project", projectId });
  };

  // detail 패널은 hover가 아닌 '선택된(클릭된)' 소스를 표시
  const display = cs[contextSource];
  const DisplayIcon = SOURCE_ICONS[contextSource];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-8">
        {/* Header */}
        <Stack gap="xs" className="mb-8">
          <Heading level="page" as="h1">{t.evaluations.evalSettings}</Heading>
          <Text variant="caption" className="mt-1.5">{t.evaluations.configureDesc}</Text>
        </Stack>

        {/* ── Context Source ── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <Heading level="sub">{t.evaluations.contextSource}</Heading>
              <Text variant="caption" className="mt-1">{t.evaluations.contextSourceDesc}</Text>
            </div>
            {saved && (
              <span className="flex items-center gap-1 text-xs font-medium text-foreground animate-in fade-in">
                <Check className="size-3.5" /> {t.evaluations.saved}
              </span>
            )}
          </div>

          <div className="flex items-start gap-4">
            {/* Left — Option cards */}
            <div className="flex w-[280px] shrink-0 flex-col gap-2">
              {SOURCE_IDS.map((id) => {
                const Icon = SOURCE_ICONS[id];
                const src = cs[id];
                const isActive = contextSource === id;
                const isHovered = hoveredId === id;

                return (
                  <button
                    key={id}
                    onClick={() => handleSave(id)}
                    onMouseEnter={() => setHoveredId(id)}
                    onMouseLeave={() => setHoveredId(null)}
                    disabled={saving}
                    className={cn(
                      "group relative flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-all duration-150",
                      isActive ? "border-foreground bg-foreground/[0.03]" : "border-border/60 hover:border-foreground/30 hover:bg-accent/30",
                    )}
                  >
                    {/* Radio */}
                    <div className={cn(
                      "flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
                      isActive ? "border-foreground" : "border-muted-foreground/25",
                    )}>
                      {isActive && <div className="size-[8px] rounded-full bg-foreground" />}
                    </div>

                    {/* Icon */}
                    <div className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
                      isActive ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                    )}>
                      <Icon className="size-3.5" />
                    </div>

                    {/* Text */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium">{src.label}</p>
                        <span className={cn(
                          "text-[9px] uppercase tracking-wider",
                          isActive ? "text-foreground/50" : "text-muted-foreground/40",
                        )}>
                          {src.shortDesc}
                        </span>
                      </div>
                    </div>

                    {/* Arrow on hover */}
                    <ArrowRight className={cn(
                      "size-3 shrink-0 text-muted-foreground/30 transition-all duration-150",
                      (isHovered || isActive) ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0",
                    )} />
                  </button>
                );
              })}
            </div>

            {/* Right — Detail panel (selected source) */}
            <div className="min-w-0 flex-1">
              <div className="min-h-[340px] rounded-lg border bg-muted/10 p-5">
                {/* Title */}
                <div className="mb-4 flex items-center gap-2.5 border-b pb-4">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
                    <DisplayIcon className="size-4" />
                  </div>
                  <div>
                    <Heading level="section" as="h4" className="text-sm">{display.label}</Heading>
                    <Text variant="caption">{display.desc}</Text>
                  </div>
                </div>

                {/* How it works */}
                <div className="mb-4">
                  <Heading level="sub" as="h5" className="mb-2.5 text-muted-foreground/50">{t.evaluations.howItWorks}</Heading>
                  <div className="space-y-2">
                    {display.details.map((d, i) => (
                      <div key={i} className="flex gap-2.5">
                        <div className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">
                          {i + 1}
                        </div>
                        <div>
                          <p className="text-[12px] font-medium leading-tight">{d.text}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground/60">{d.sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* When to use */}
                <div className="mb-4">
                  <Heading level="sub" as="h5" className="mb-2 text-muted-foreground/50">{t.evaluations.whenToUse}</Heading>
                  <Text variant="caption" className="leading-relaxed">{display.useCase}</Text>
                </div>

                {/* Suitable agents */}
                <div>
                  <Heading level="sub" as="h5" className="mb-2 text-muted-foreground/50">{t.evaluations.suitableFor}</Heading>
                  <div className="flex flex-wrap gap-1">
                    {display.agents.map((a) => (
                      <span key={a} className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
