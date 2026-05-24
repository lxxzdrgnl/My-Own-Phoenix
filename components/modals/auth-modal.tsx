"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ModalForm } from "@/components/ui/modal-form";
import { useI18n } from "@/lib/i18n";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const router = useRouter();
  const { t } = useI18n();

  const handleConfirm = useCallback(() => {
    router.push("/login");
    onClose();
  }, [router, onClose]);

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={handleConfirm}
      title={t.auth.signInRequired}
      description={t.auth.signInDesc}
      submitLabel={t.nav.signIn}
      cancelLabel={t.common.cancel}
      size="sm"
    >
      <></>
    </ModalForm>
  );
}
