// lib/hooks/use-project-sse.ts
"use client";

import { useEffect, useRef } from "react";
import { auth } from "@/lib/firebase";

export type SseEventHandler = (msg: { type: string; [k: string]: unknown }) => void;

/**
 * Subscribe to SSE events for a project. Reconnects after 5s on disconnect.
 *
 * Uses fetch + ReadableStream (NOT EventSource) so we can send the Firebase
 * ID token via Authorization header. Manually parses SSE frames.
 */
export function useProjectSse(projectIdent: string | undefined, handler: SseEventHandler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!projectIdent) return;
    let abort = new AbortController();
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const dispatch = (eventName: string, data: string) => {
      try {
        const payload = JSON.parse(data);
        // Server sends "type" in payload; eventName matches it. Use payload directly.
        handlerRef.current(payload);
      } catch {
        // ignore malformed
      }
    };

    const open = async () => {
      if (stopped) return;
      abort = new AbortController();

      let token = "";
      try {
        token = (await auth.currentUser?.getIdToken()) ?? "";
      } catch {
        // not signed in — back off
      }

      if (!token) {
        if (!stopped) retryTimer = setTimeout(open, 5000);
        return;
      }

      try {
        const res = await fetch(`/api/sse/project/${encodeURIComponent(projectIdent)}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`SSE ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let currentEvent = "message";
        let currentData = "";

        const flush = () => {
          if (currentData) {
            dispatch(currentEvent, currentData);
          }
          currentEvent = "message";
          currentData = "";
        };

        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          // Process complete lines
          let nl = buf.indexOf("\n");
          while (nl >= 0) {
            const line = buf.slice(0, nl).replace(/\r$/, "");
            buf = buf.slice(nl + 1);
            nl = buf.indexOf("\n");

            if (line === "") {
              // blank line: dispatch event
              flush();
              continue;
            }
            if (line.startsWith(":")) {
              // comment / keepalive
              continue;
            }
            if (line.startsWith("event:")) {
              currentEvent = line.slice(6).trim();
              continue;
            }
            if (line.startsWith("data:")) {
              currentData += (currentData ? "\n" : "") + line.slice(5).trim();
              continue;
            }
            // unrecognized field — ignore
          }
        }
      } catch (e) {
        // network error, auth expired, etc — retry
        if (!stopped) {
          retryTimer = setTimeout(open, 5000);
        }
      }
    };

    open();

    return () => {
      stopped = true;
      abort.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [projectIdent]);
}
