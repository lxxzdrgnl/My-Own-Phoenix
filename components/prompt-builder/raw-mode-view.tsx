"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { useT } from "@/lib/i18n";

interface RawModeViewProps {
  template: string;
  onChange: (template: string) => void;
  onSwitchToForm: () => void;
}

export function RawModeView({ template, onChange, onSwitchToForm }: RawModeViewProps) {
  const t = useT();

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {t.promptBuilder.promptTemplateRaw}
        </label>
        <Button
          size="sm"
          variant="ghost"
          onClick={onSwitchToForm}
          className="gap-1.5 text-[11px] h-6"
        >
          <Eye className="size-3" /> {t.promptBuilder.formView}
        </Button>
      </div>
      <Textarea
        value={template}
        onChange={(e) => onChange(e.target.value)}
        rows={16}
        className="font-mono text-xs leading-relaxed"
      />
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        {t.promptBuilder.placeholders}: <code className="rounded bg-muted px-1">{"{context}"}</code>{" "}
        <code className="rounded bg-muted px-1">{"{query}"}</code>{" "}
        <code className="rounded bg-muted px-1">{"{response}"}</code>
      </p>
    </div>
  );
}
