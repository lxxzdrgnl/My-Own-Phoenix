// lib/sse-broadcast.ts
// In-memory pub/sub for SSE. Single-instance only.
// Each project has a Set of writer functions; broadcast invokes each writer.

export type SseMessageBase = { type: string };

export type EvalCompletedMessage = SseMessageBase & {
  type: "eval-completed";
  spanId: string;
  name: string;
  kind: "LLM" | "HUMAN";
};

export type LayoutUpdatedMessage = SseMessageBase & {
  type: "layout-updated";
  projectId: string;
  savedBy: string;
  savedAt: string;
};

// Discriminated union — extend by adding new variants.
export type SseMessage = EvalCompletedMessage | LayoutUpdatedMessage;

type Writer = (msg: SseMessage) => void;
const projectWriters = new Map<string, Set<Writer>>();

export function addWriter(projectId: string, writer: Writer): () => void {
  let set = projectWriters.get(projectId);
  if (!set) {
    set = new Set();
    projectWriters.set(projectId, set);
  }
  set.add(writer);
  return () => removeWriter(projectId, writer);
}

export function removeWriter(projectId: string, writer: Writer): void {
  const set = projectWriters.get(projectId);
  if (!set) return;
  set.delete(writer);
  if (set.size === 0) projectWriters.delete(projectId);
}

export function broadcast(projectId: string, msg: SseMessage): number {
  const set = projectWriters.get(projectId);
  if (!set) return 0;
  let n = 0;
  for (const w of set) {
    try {
      w(msg);
      n++;
    } catch {
      // writer closed
    }
  }
  return n;
}

export function connectionCount(projectId: string): number {
  return projectWriters.get(projectId)?.size ?? 0;
}

// Backwards-compat alias for code that imports `subscribe` (e.g. #1 dashboard
// branch). Same semantics as addWriter — returns an unsubscribe function.
export const subscribe = addWriter;
