"use client";

import * as React from "react";
import { ModalForm } from "@/components/ui/modal-form";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
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
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 모달이 열릴 때마다 폼 초기화
  React.useEffect(() => {
    if (open) {
      setName(dataset?.name ?? "");
      setError(null);
    }
  }, [open, dataset]);

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
      if (isEdit && dataset) {
        // 편집: PUT /api/datasets
        const res = await apiFetch("/api/datasets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: dataset.id, name: name.trim() }),
        });
        if (!res.ok) {
          setError("데이터셋 수정에 실패했습니다.");
          return;
        }
        const data = await res.json();
        onSaved?.(data.dataset ?? { ...dataset, name: name.trim() });
      } else {
        // 신규 생성: POST /api/datasets
        const res = await apiFetch("/api/datasets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!res.ok) {
          setError("데이터셋 생성에 실패했습니다.");
          return;
        }
        const data = await res.json();
        onSaved?.(data.dataset);
      }
      handleClose();
    } catch (e) {
      console.error(e);
      setError(isEdit ? "데이터셋 수정에 실패했습니다." : "데이터셋 생성에 실패했습니다.");
    } finally {
      setSaving(false);
    }
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
