"use client";

import * as React from "react";
import { ModalForm } from "@/components/ui/modal-form";
import { Input } from "@/components/ui/input";
import { useFormSubmit } from "@/lib/hooks/use-form-submit";
import { useT } from "@/lib/i18n";

// ─── Type ─────────────────────────────────────────────────────────────────────

export interface DatasetMeta {
  id: string;
  name: string;
  fileName: string;
  headers: string;
  queryCol: string;
  contextCol: string;
  rowCount: number;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DatasetFormModalProps {
  open: boolean;
  onClose: () => void;
  /** undefined → 신규 생성, 값 있으면 편집 */
  dataset?: DatasetMeta;
  onSaved?: (dataset: DatasetMeta) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DatasetFormModal({
  open,
  onClose,
  dataset,
  onSaved,
}: DatasetFormModalProps) {
  const t = useT();
  const isEdit = !!dataset;

  const [name, setName] = React.useState("");

  const { submit, saving, error, clearError } = useFormSubmit(
    "/api/datasets",
    isEdit ? "PUT" : "POST",
    {
      onSuccess: (result) => {
        const saved: DatasetMeta =
          result?.dataset ?? (isEdit && dataset ? { ...dataset, name: name.trim() } : result);
        onSaved?.(saved);
        onClose();
      },
    }
  );

  // 모달이 열릴 때마다 폼 초기화
  React.useEffect(() => {
    if (open) {
      setName(dataset?.name ?? "");
      clearError();
    }
  }, [open, dataset]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    setName("");
    clearError();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    const body = isEdit && dataset
      ? { id: dataset.id, name: name.trim() }
      : { name: name.trim() };
    await submit(body);
  };

  return (
    <ModalForm
      open={open}
      onClose={handleClose}
      onSubmit={handleSubmit}
      title={isEdit ? "데이터셋 편집" : "새 데이터셋"}
      saving={saving}
      error={error}
      submitLabel={isEdit ? "저장" : t.common.create}
      cancelLabel={t.common.cancel}
      submitDisabled={!name.trim()}
      size="sm"
    >
      <div className="space-y-1.5">
        <label htmlFor="dataset-form-name" className="text-sm font-medium">
          {t.datasets.dataset} 이름
        </label>
        <Input
          id="dataset-form-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.datasets.datasetName}
          autoFocus
        />
      </div>
    </ModalForm>
  );
}
