"use client";

import { useState, useCallback, useEffect } from "react";
import { Trash2, Plus, CheckCircle } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/ui/empty-state";
import { LoadingButton } from "@/components/ui/loading-button";
import { ChatSuggestion, MAX_CHAT_SUGGESTIONS, parseChatSuggestions } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { useT } from "@/lib/i18n";

// ── Questions Tab ──

export function QuestionsTab({ project }: { project: string }) {
  const t = useT();
  const [suggestions, setSuggestions] = useState<ChatSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [addMode, setAddMode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/settings");
      const data = await res.json();
      setSuggestions(parseChatSuggestions(data[`chatSuggestions:${project}`]));
    } catch { setSuggestions([]); }
    setLoading(false);
  }, [project]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [`chatSuggestions:${project}`]: JSON.stringify(suggestions) }),
      });
      setSaved(true);
      setDirty(false);
    } catch (e) { logger.error("save chat suggestions failed", e); }
    setSaving(false);
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-2">
      {suggestions.map((s, idx) => (
        <div key={idx}>
          {editIdx === idx ? (
            <QuestionInlineForm
              initial={s}
              onSave={(u) => { setSuggestions((p) => p.map((x, i) => i === idx ? u : x)); setEditIdx(null); setDirty(true); setSaved(false); }}
              onCancel={() => setEditIdx(null)}
            />
          ) : (
            <div className="group flex items-center gap-2 rounded-md border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-muted/20">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setEditIdx(idx)}>
                <p className="text-xs font-medium truncate">{s.title || "Untitled"}</p>
                <p className="text-[10px] text-muted-foreground/50 truncate">{s.label}</p>
              </div>
              <button
                onClick={() => { setSuggestions((p) => p.filter((_, i) => i !== idx)); setDirty(true); setSaved(false); if (editIdx === idx) setEditIdx(null); }}
                className="rounded p-1 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/30 hover:!text-[#ef4444]"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      ))}

      {suggestions.length === 0 && !addMode && (
        <p className="text-xs text-muted-foreground/40 py-2">{t.settings.noStarterQuestions}</p>
      )}

      {addMode ? (
        <QuestionInlineForm
          initial={{ title: "", label: "", prompt: "" }}
          onSave={(n) => { setSuggestions((p) => [...p, n]); setAddMode(false); setDirty(true); setSaved(false); }}
          onCancel={() => setAddMode(false)}
        />
      ) : (
        <div className="flex items-center gap-2 pt-1">
          {suggestions.length < MAX_CHAT_SUGGESTIONS && (
            <button onClick={() => setAddMode(true)} className="flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-[11px] text-muted-foreground/50 transition-colors hover:border-foreground/20 hover:text-foreground">
              <Plus className="h-3 w-3" /> {t.common.add}
            </button>
          )}
          {dirty && (
            <LoadingButton onClick={handleSave} loading={saving} loadingText={t.common.save} size="sm" className="h-7 text-xs">
              {t.common.save}
            </LoadingButton>
          )}
          {saved && !dirty && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <CheckCircle className="h-3 w-3 text-[#10b981]" /> {t.settings.saved}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Question Inline Form ──

export function QuestionInlineForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ChatSuggestion;
  onSave: (s: ChatSuggestion) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(initial.title);
  const [label, setLabel] = useState(initial.label);
  const [prompt, setPrompt] = useState(initial.prompt);

  return (
    <div className="rounded-md border bg-muted/5 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.settings.titleField}
          className="text-xs"
          autoFocus
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t.settings.subtitleField}
          className="text-xs"
        />
      </div>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t.settings.fullPrompt}
        rows={2}
        className="text-xs"
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => { if (title.trim() && prompt.trim()) onSave({ title: title.trim(), label: label.trim(), prompt: prompt.trim() }); }}
          disabled={!title.trim() || !prompt.trim()}
        >
          {initial.title ? t.settings.update : t.common.add}
        </Button>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </div>
  );
}
