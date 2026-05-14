"use client";

import { useState } from "react";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { Check, Loader2 } from "lucide-react";

interface JoinProjectModalProps {
  open: boolean;
  onClose: () => void;
}

export function JoinProjectModal({ open, onClose }: JoinProjectModalProps) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "pending" | "error">("idle");
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!code.trim()) return;
    setStatus("loading");
    setError("");
    try {
      const res = await apiFetch("/api/projects/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to join");
        setStatus("error");
        return;
      }
      setProjectName(data.project?.name || "");
      setStatus("pending");
    } catch {
      setError("Network error");
      setStatus("error");
    }
  };

  const handleClose = () => {
    setCode("");
    setStatus("idle");
    setError("");
    setProjectName("");
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} className="w-[400px]">
      <ModalHeader onClose={handleClose}>Join a Project</ModalHeader>
      <ModalBody>
        {status === "pending" ? (
          <div className="text-center py-4">
            <Check className="mx-auto mb-3 h-8 w-8 text-foreground" />
            <p className="text-sm font-medium">Request submitted</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Project: {projectName}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Waiting for owner approval. You&apos;ll get access once approved.
            </p>
            <Button className="mt-4" onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Invite Code</label>
              <Input
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(""); }}
                placeholder="Paste invite code here"
                autoFocus
                className="mt-1 font-mono"
              />
              {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={!code.trim() || status === "loading"}>
                {status === "loading" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Join
              </Button>
            </div>
          </form>
        )}
      </ModalBody>
    </Modal>
  );
}
