"use client";

import { useState } from "react";
import { ModalForm } from "@/components/ui/modal-form";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useFormSubmit } from "@/lib/hooks/use-form-submit";

interface JoinProjectModalProps {
  open: boolean;
  onClose: () => void;
}

export function JoinProjectModal({ open, onClose }: JoinProjectModalProps) {
  const t = useT();
  const [code, setCode] = useState("");
  const [projectName, setProjectName] = useState("");
  const [mode, setMode] = useState<"form" | "pending">("form");

  const { submit, saving, error, clearError } = useFormSubmit<{ code: string }>(
    "/api/projects/join",
    "POST",
    {
      onSuccess: (result) => {
        setProjectName(result?.project?.name || "");
        setMode("pending");
      },
    }
  );

  const handleSubmit = async () => {
    if (!code.trim()) return;
    await submit({ code: code.trim() });
  };

  const handleClose = () => {
    setCode("");
    setMode("form");
    clearError();
    setProjectName("");
    onClose();
  };

  if (mode === "pending") {
    return (
      <ModalForm
        open={open}
        onClose={handleClose}
        onSubmit={handleClose}
        title={t.joinModal.title}
        submitLabel={t.common.close}
        cancelLabel=""
        size="sm"
      >
        <div className="text-center py-4">
          <Check className="mx-auto mb-3 h-8 w-8 text-foreground" />
          <p className="text-sm font-medium">{t.joinModal.requestSubmitted}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Project: {projectName}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t.joinModal.waitingApproval}
          </p>
        </div>
      </ModalForm>
    );
  }

  return (
    <ModalForm
      open={open}
      onClose={handleClose}
      onSubmit={handleSubmit}
      title={t.joinModal.title}
      saving={saving}
      error={error || null}
      submitLabel={t.projects.join}
      cancelLabel={t.common.cancel}
      submitDisabled={!code.trim() || saving}
      size="sm"
    >
      <div>
        <label className="text-sm font-medium">{t.joinModal.inviteCode}</label>
        <Input
          value={code}
          onChange={(e) => { setCode(e.target.value); clearError(); }}
          placeholder={t.joinModal.placeholder}
          autoFocus
          className="mt-1 font-mono"
        />
      </div>
    </ModalForm>
  );
}
