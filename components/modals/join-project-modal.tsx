"use client";

import { useState } from "react";
import { ModalForm } from "@/components/ui/modal-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { Check } from "lucide-react";
import { useT } from "@/lib/i18n";

interface JoinProjectModalProps {
  open: boolean;
  onClose: () => void;
}

export function JoinProjectModal({ open, onClose }: JoinProjectModalProps) {
  const t = useT();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "pending" | "error">("idle");
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!code.trim()) return;
    setStatus("loading");
    setError("");
    try {
      const res = await apiFetch("/api/projects/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to join");
        setStatus("error");
        return;
      }
      setProjectName(data.project?.name || "");
      setStatus("pending");
    } catch {
      setError("Network error");
      setStatus("error");
    }
  };

  const handleClose = () => {
    setCode("");
    setStatus("idle");
    setError("");
    setProjectName("");
    onClose();
  };

  if (status === "pending") {
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
      saving={status === "loading"}
      error={error || null}
      submitLabel={t.projects.join}
      cancelLabel={t.common.cancel}
      submitDisabled={!code.trim() || status === "loading"}
      size="sm"
    >
      <div>
        <label className="text-sm font-medium">{t.joinModal.inviteCode}</label>
        <Input
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(""); }}
          placeholder={t.joinModal.placeholder}
          autoFocus
          className="mt-1 font-mono"
        />
      </div>
    </ModalForm>
  );
}
