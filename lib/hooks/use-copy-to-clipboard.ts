import { useState, useCallback } from "react";
import { UI_FEEDBACK_RESET_MS } from "@/lib/config/timeouts";

export function useCopyToClipboard(resetMs: number = UI_FEEDBACK_RESET_MS) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), resetMs);
        return true;
      } catch {
        return false;
      }
    },
    [resetMs],
  );
  return { copied, copy };
}
