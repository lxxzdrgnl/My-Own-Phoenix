"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ModalForm } from "@/components/ui/modal-form";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
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
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // name 초기화 — 모달이 닫힐 때
  const handleClose = () => {
    setName("");
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        onCreated?.({ id: data.id, name: data.name ?? name.trim() });
        handleClose();
        router.push(`/${data.slug}/dashboard`);
      } else {
        setError("프로젝트 생성에 실패했습니다.");
      }
    } catch (e) {
      console.error(e);
      setError("프로젝트 생성에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalForm
      open={open}
      onClose={handleClose}
      onSubmit={handleSubmit}
      title={t.projects.createProject}
      saving={saving}
      error={error}
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
