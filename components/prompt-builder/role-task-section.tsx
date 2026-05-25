"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n";
import type { EvalFormConfig } from "./types";

interface RoleTaskSectionProps {
  config: EvalFormConfig;
  onUpdate: (partial: Partial<EvalFormConfig>) => void;
}

export function RoleTaskSection({ config, onUpdate }: RoleTaskSectionProps) {
  const t = useT();

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {t.promptBuilder.evaluatorRole}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{t.promptBuilder.youAreExpert}</span>
        <Input
          value={config.role}
          onChange={(e) => onUpdate({ role: e.target.value })}
          className="h-8 text-xs flex-1"
          placeholder="AI response evaluator"
        />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
          {t.promptBuilder.taskDescription}
        </p>
        <Textarea
          value={config.task}
          onChange={(e) => onUpdate({ task: e.target.value })}
          rows={2}
          className="text-xs"
          placeholder="Evaluate the quality of the RESPONSE based on the given CONTEXT and QUERY."
        />
      </div>
    </div>
  );
}
