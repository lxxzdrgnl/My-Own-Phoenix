import type { GuardrailDetection, RawSpan } from "./types";

/**
 * Parse a raw `guardrail.detections` attribute value into a typed array.
 * Accepts either a JSON string (the canonical OTel attribute form) or an
 * already-parsed array. Returns `[]` on any error so callers can render
 * gracefully when an emitter sends malformed data.
 */
export function parseGuardrailDetections(raw: unknown): GuardrailDetection[] {
  if (!raw) return [];
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: GuardrailDetection[] = [];
  for (const d of arr) {
    if (!d || typeof d !== "object") continue;
    const o = d as Record<string, unknown>;
    const type = typeof o.type === "string" ? o.type : "";
    const start = Number(o.start);
    const end = Number(o.end);
    const masked = typeof o.masked === "string" ? o.masked : "";
    if (!type || Number.isNaN(start) || Number.isNaN(end)) continue;
    out.push({ type, start, end, masked });
  }
  return out;
}

/**
 * Walk a span tree and return true iff any node is a GUARDRAIL span with
 * `guardrail.triggered === true`. Safe to call on trees that contain no
 * guardrail spans at all (returns false).
 */
export function computeHasGuardrailTriggered(root: RawSpan): boolean {
  if (root.spanKind?.toUpperCase() === "GUARDRAIL" && root.guardrailTriggered === true) {
    return true;
  }
  for (const child of root.children ?? []) {
    if (computeHasGuardrailTriggered(child)) return true;
  }
  return false;
}
