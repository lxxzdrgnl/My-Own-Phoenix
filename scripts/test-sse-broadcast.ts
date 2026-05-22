import assert from "node:assert/strict";
import { broadcast, subscribe, type SseMessage } from "../lib/sse-broadcast";

const messages: SseMessage[] = [];
const unsub = subscribe("proj-1", (m) => messages.push(m));

// Fan-out to subscribers of the same project only
broadcast("proj-1", { type: "layout-updated", projectId: "proj-1", savedBy: "u1", savedAt: "2026-05-23T00:00:00Z" });
broadcast("proj-2", { type: "layout-updated", projectId: "proj-2", savedBy: "u2", savedAt: "2026-05-23T00:00:00Z" });

assert.equal(messages.length, 1, "expected 1 message in proj-1");
assert.equal(messages[0].type, "layout-updated");

// Unsubscribe stops delivery
unsub();
broadcast("proj-1", { type: "layout-updated", projectId: "proj-1", savedBy: "u1", savedAt: "2026-05-23T00:01:00Z" });
assert.equal(messages.length, 1, "expected no new messages after unsubscribe");

console.log("PASS: sse-broadcast");
