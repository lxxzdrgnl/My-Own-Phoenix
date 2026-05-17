"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>{t.auth.signInRequired}</DialogTitle>
        <DialogDescription>
          {t.auth.signInDesc}
        </DialogDescription>
        <DialogFooter className="flex gap-2 sm:justify-end">
          <Button variant="outline" onClick={handleCancel}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleConfirm}>{t.nav.signIn}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
