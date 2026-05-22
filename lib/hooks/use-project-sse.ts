// lib/hooks/use-project-sse.ts
"use client";

import { useEffect, useRef } from "react";

export type SseEventHandler = (msg: { type: string; [k: string]: unknown }) => void;

/**
 * Subscribe to SSE events for a project. Reconnects after 5s on disconnect.
 * Handler may be called for any event type; switch on msg.type.
 *
 * Note: EventSource does not support custom headers, so the SSE endpoint
 * must rely on auth cookies (Firebase sets one when using getAuth().currentUser).
 * In environments where only Bearer tokens are used, this hook will fail auth
 * and the SSE will not connect — UI must degrade gracefully (manual refresh).
 */
export function useProjectSse(projectIdent: string | undefined, handler: SseEventHandler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!projectIdent) return;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const open = () => {
      if (stopped) return;
      es = new EventSource(`/api/sse/project/${encodeURIComponent(projectIdent)}`);

      es.addEventListener("eval-completed", (ev) => {
        try {
          handlerRef.current(JSON.parse((ev as MessageEvent).data));
        } catch {
          // ignore malformed
        }
      });

      es.addEventListener("layout-updated", (ev) => {
        try {
          handlerRef.current(JSON.parse((ev as MessageEvent).data));
        } catch {
          // ignore malformed
        }
      });

      es.onerror = () => {
        es?.close();
        es = null;
        if (!stopped) retryTimer = setTimeout(open, 5000);
      };
    };

    open();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [projectIdent]);
}
