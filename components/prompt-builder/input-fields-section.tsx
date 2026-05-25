"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { EvalFormConfig } from "./types";

interface InputFieldsSectionProps {
  config: EvalFormConfig;
  onToggle: (field: "context" | "query" | "response") => void;
}

export function InputFieldsSection({ config, onToggle }: InputFieldsSectionProps) {
  const t = useT();

  return (
    <div className="rounded-lg border p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
        {t.promptBuilder.inputFields}
      </p>
      <div className="flex gap-2">
        {(["context", "query", "response"] as const).map((field) => {
          const active = config.inputFields.includes(field);
          return (
            <button
              key={field}
              onClick={() => onToggle(field)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40",
              )}
            >
              <code className="text-[10px]">{`{${field}}`}</code>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        {t.promptBuilder.inputFieldsDesc}
      </p>
    </div>
  );
}
