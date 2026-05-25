"use client";

import { useState, useEffect, useCallback } from "react";
import { ModalForm } from "@/components/ui/modal-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormLabel } from "@/components/ui/form-field";
import type { Annotation } from "@/lib/phoenix";
import { useT } from "@/lib/i18n";
import { useFormSubmit } from "@/lib/hooks/use-form-submit";
import { apiFetch } from "@/lib/api-client";

interface EvalOption {
  name: string;
  outputMode: string;
  badgeLabel: string;
}

interface AnnotationFormProps {
  open: boolean;
  onClose: () => void;
  spanId: string;
  existingAnnotations?: Annotation[];
  onSaved?: () => void;
  /** Pre-select this eval name (e.g. when triggered from a specific eval row). */
  prefillEvalName?: string;
}

export function AnnotationForm({ open, onClose, spanId, existingAnnotations = [], onSaved, prefillEvalName }: AnnotationFormProps) {
  const t = useT();
  const [evalOptions, setEvalOptions] = useState<EvalOption[]>([]);
  const [selectedEval, setSelectedEval] = useState("");
  const [customName, setCustomName] = useState("");
  const [mode, setMode] = useState<"binary" | "score">("binary");
  const [label, setLabel] = useState<"pass" | "fail" | "">("");
  const [score, setScore] = useState("1.0");
  const [comment, setComment] = useState("");

  const { submit, saving, error, setError } = useFormSubmit("/api/annotations", "POST", {
    onSuccess: () => { onSaved?.(); onClose(); },
  });

  const loadEvals = useCallback(async () => {
    try {
      const res = await apiFetch("/api/eval-prompts");
      const data = await res.json();
      setEvalOptions(
        (data.items ?? []).map((p: any) => ({
          name: p.name,
          outputMode: p.outputMode ?? "binary",
          badgeLabel: p.badgeLabel ?? "",
        })),
      );
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (open) {
      loadEvals();
      setSelectedEval(prefillEvalName ?? "");
      setCustomName("");
      setLabel("");
      setScore("1.0");
      setComment("");
      setError(undefined);
    }
  }, [open, loadEvals, prefillEvalName]);

  useEffect(() => {
    if (selectedEval === "__custom__") {
      setMode("binary");
    } else {
      const ev = evalOptions.find((e) => e.name === selectedEval);
      setMode(ev?.outputMode === "score" ? "score" : "binary");
    }
    setLabel("");
    setScore("1.0");
  }, [selectedEval, evalOptions]);

  const evalName = selectedEval === "__custom__" ? customName.trim() : selectedEval;

  async function handleSave() {
    if (!evalName) { setError("Select or enter an eval name."); return; }
    if (mode === "binary" && !label) { setError("Select Pass or Fail."); return; }

    const finalLabel = mode === "binary" ? label : (Number(score) >= 0.5 ? "pass" : "fail");
    const finalScore = mode === "binary" ? (label === "pass" ? 1.0 : 0.0) : Number(score);

    await submit({
      spanId,
      name: evalName,
      label: finalLabel,
      score: finalScore,
      explanation: comment.trim() || undefined,
    });
  }

  const existingNames = new Set(existingAnnotations.map((a) => a.name));
  const availableEvals = evalOptions.filter((e) => !existingNames.has(e.name));

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={handleSave}
      title={t.annotationForm.title}
      saving={saving}
      error={error}
      submitLabel={t.common.save}
      cancelLabel={t.common.cancel}
      submitDisabled={!evalName}
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <FormLabel>{t.annotationForm.evaluation}</FormLabel>
          <select
            value={selectedEval}
            onChange={(e) => setSelectedEval(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t.annotationForm.selectEval}</option>
            {availableEvals.map((e) => (
              <option key={e.name} value={e.name}>
                {e.badgeLabel ? `${e.name} (${e.badgeLabel})` : e.name}
              </option>
            ))}
            <option value="__custom__">{t.annotationForm.customName}</option>
          </select>
          {selectedEval === "__custom__" && (
            <Input
              className="mt-2"
              placeholder={t.annotationForm.enterName}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          )}
        </div>

        {evalName && (
          <div>
            <FormLabel>{t.annotationForm.result}</FormLabel>
            {mode === "binary" ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={label === "pass" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setLabel("pass")}
                >
                  {t.annotationForm.pass}
                </Button>
                <Button
                  type="button"
                  variant={label === "fail" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setLabel("fail")}
                >
                  {t.annotationForm.fail}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  className="w-24 text-center tabular-nums"
                />
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-foreground/40 transition-all"
                    style={{ width: `${Math.max(0, Math.min(1, Number(score))) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {evalName && (
          <div>
            <FormLabel>{t.annotationForm.comment}</FormLabel>
            <Textarea
              rows={2}
              placeholder={t.annotationForm.commentPlaceholder}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        )}
      </div>
    </ModalForm>
  );
}
