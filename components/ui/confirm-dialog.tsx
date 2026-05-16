"use client";

import { useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

// ─── Trigger-based (declarative) ────────────────────────────────────────

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmText?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
  trigger: ReactNode;
}

export function ConfirmDialog({
  title, description, confirmText = "Confirm", variant = "destructive", onConfirm, trigger,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(); setOpen(false); } finally { setLoading(false); }
  };

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalHeader onClose={() => setOpen(false)}>{title}</ModalHeader>
        <ModalBody>
          <p className="text-sm text-muted-foreground mb-4">{description}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant={variant} onClick={handleConfirm} disabled={loading}>{confirmText}</Button>
          </div>
        </ModalBody>
      </Modal>
    </>
  );
}

// ─── Imperative hook (useConfirm) ───────────────────────────────────────

interface ConfirmOptions {
  title: string;
  description: string;
  confirmText?: string;
  variant?: "default" | "destructive";
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  const handleClose = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal open onClose={() => handleClose(false)}>
          <ModalHeader onClose={() => handleClose(false)}>{state.title}</ModalHeader>
          <ModalBody>
            <p className="text-sm text-muted-foreground mb-4">{state.description}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button variant={state.variant ?? "default"} onClick={() => handleClose(true)}>
                {state.confirmText ?? "Confirm"}
              </Button>
            </div>
          </ModalBody>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
