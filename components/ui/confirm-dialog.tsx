"use client";

import { useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { useDisclosure } from "@/lib/hooks/use-disclosure";
import { ModalShell, ModalHeader, ModalBody } from "@/components/ui/modal-shell";
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
  const dialog = useDisclosure();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(); dialog.close(); } finally { setLoading(false); }
  };

  return (
    <>
      <span onClick={dialog.open}>{trigger}</span>
      <ModalShell open={dialog.isOpen} onClose={dialog.close} size="sm">
        <ModalHeader title={title} description={description} />
        <ModalBody>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={dialog.close}>Cancel</Button>
            <Button variant={variant} onClick={handleConfirm} disabled={loading}>{confirmText}</Button>
          </div>
        </ModalBody>
      </ModalShell>
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
        <ModalShell open onClose={() => handleClose(false)} size="sm">
          <ModalHeader title={state.title} description={state.description} />
          <ModalBody>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button variant={state.variant ?? "default"} onClick={() => handleClose(true)}>
                {state.confirmText ?? "Confirm"}
              </Button>
            </div>
          </ModalBody>
        </ModalShell>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
