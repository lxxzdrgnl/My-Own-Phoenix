"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ModalForm } from "@/components/ui/modal-form";
import { Input } from "@/components/ui/input";
import { useFormSubmit } from "@/lib/hooks/use-form-submit";
import { useT } from "@/lib/i18n";

export function CreateProjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (project: { id: string; name: string }) => void;
}) {
  const router = useRouter();
  const t = useT();
  const [name, setName] = React.useState("");

  const { submit, saving, error, clearError } = useFormSubmit<{ name: string }>(
    "/api/projects",
    "POST",
    {
      onSuccess: (data) => {
        onCreated?.({ id: data.id, name: data.name ?? name.trim() });
        setName("");
        onClose();
        router.push(`/${data.slug}/dashboard`);
      },
    }
  );

  // name 초기화 — 모달이 닫힐 때
  const handleClose = () => {
    setName("");
    clearError();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await submit({ name: name.trim() });
  };

  return (
    <ModalForm
      open={open}
      onClose={handleClose}
      onSubmit={handleSubmit}
      title={t.projects.createProject}
      saving={saving}
      error={error ?? null}
      submitLabel={t.common.create}
      cancelLabel={t.common.cancel}
      submitDisabled={!name.trim()}
      size="sm"
    >
      <div className="space-y-1.5">
        <label htmlFor="create-project-name" className="text-sm font-medium">
          {t.projects.projectName}
        </label>
        <Input
          id="create-project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-legal-rag"
          autoFocus
        />
      </div>
    </ModalForm>
  );
}
