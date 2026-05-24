"use client";

import * as React from "react";
import { ModalShell, ModalHeader, ModalBody } from "./modal-shell";
import { Button } from "./button";

type Size = "sm" | "md" | "lg" | "xl";

export function ModalForm({
  open,
  onClose,
  onSubmit,
  title,
  description,
  saving,
  error,
  submitLabel = "저장",
  cancelLabel = "취소",
  size,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  title: string;
  description?: string;
  saving?: boolean;
  error?: string | null;
  submitLabel?: string;
  cancelLabel?: string;
  size?: Size;
  children: React.ReactNode;
}) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSubmit();
  };

  return (
    <ModalShell open={open} onClose={onClose} size={size}>
      <form onSubmit={handleSubmit}>
        <ModalHeader title={title} description={description} />
        <ModalBody>{children}</ModalBody>
        {error && <p className="text-sm text-[#ef4444] px-1 pt-1">{error}</p>}
        <div className="flex justify-end gap-2 pt-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            {cancelLabel}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "저장 중..." : submitLabel}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}
