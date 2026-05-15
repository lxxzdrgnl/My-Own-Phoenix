"use client";

import { useState } from "react";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmText?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
  trigger: React.ReactNode;
}

export function ConfirmDialog({
  title,
  description,
  confirmText = "Confirm",
  variant = "destructive",
  onConfirm,
  trigger,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalHeader onClose={() => setOpen(false)}>{title}</ModalHeader>
        <ModalBody>
          <p className="text-sm text-muted-foreground mb-4">{description}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={variant}
              onClick={handleConfirm}
              disabled={loading}
            >
              {confirmText}
            </Button>
          </div>
        </ModalBody>
      </Modal>
    </>
  );
}
