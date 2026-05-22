// lib/query/fields.ts
//
// Field metadata + value parsers. No regex (ReDoS-safe per spec).

import type { EnumField, NumericField, TextField } from "./types";

export const STATIC_NUMERIC_FIELDS: ReadonlySet<NumericField> = new Set([
  "latency",
  "cost",
  "tokens",
]);

export const STATIC_ENUM_FIELDS: ReadonlySet<EnumField> = new Set([
  "status",
  "feedback",
  "spanKind",
]);

export const STATIC_TEXT_FIELDS: ReadonlySet<TextField> = new Set([
  "model",
  "name",
]);

export const ALL_STATIC_FIELDS: ReadonlySet<string> = new Set<string>([
  ...STATIC_NUMERIC_FIELDS,
  ...STATIC_ENUM_FIELDS,
  ...STATIC_TEXT_FIELDS,
]);

/** Allowed enum values per field, lowercase. Empty set = any string allowed. */
export const ENUM_VALUES: Record<EnumField, ReadonlySet<string>> = {
  status: new Set(["ok", "error"]),
  feedback: new Set(["up", "down", "none"]),
  // spanKind is dynamic (any OpenInference kind) — no whitelist.
  spanKind: new Set(),
};

/**
 * Parse a numeric value expression for `latency` / `cost` / `tokens`.
 * Returns null on invalid input.
 *
 * Accepted forms:
 *   ">3s"   ">3000"   "<1s"   "1s..3s"   "0.01..0.1"   "3000"
 *
 * Suffix handling:
 *   latency: "s" -> seconds (× 1000), "ms" -> ms, no suffix -> ms.
 *   cost: no suffix -> USD (number).
 *   tokens: no suffix -> integer count.
 */
export function parseNumericValue(
  field: NumericField,
  raw: string,
):
  | { op: ">"; value: number }
  | { op: "<"; value: number }
  | { op: "between"; value: [number, number] }
  | null {
  if (raw.length === 0) return null;

  // Range form: "a..b"
  const rangeIdx = raw.indexOf("..");
  if (rangeIdx > 0 && rangeIdx < raw.length - 2) {
    const a = parseScalar(field, raw.slice(0, rangeIdx));
    const b = parseScalar(field, raw.slice(rangeIdx + 2));
    if (a === null || b === null) return null;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return { op: "between", value: [lo, hi] };
  }

  if (raw[0] === ">") {
    const n = parseScalar(field, raw.slice(1));
    return n === null ? null : { op: ">", value: n };
  }
  if (raw[0] === "<") {
    const n = parseScalar(field, raw.slice(1));
    return n === null ? null : { op: "<", value: n };
  }

  // Bare number = single-bucket range [n, n].
  const n = parseScalar(field, raw);
  if (n === null) return null;
  return { op: "between", value: [n, n] };
}

function parseScalar(field: NumericField, s: string): number | null {
  if (s.length === 0) return null;
  let value = s;
  let multiplier = 1;
  if (field === "latency") {
    if (value.endsWith("ms")) {
      value = value.slice(0, -2);
    } else if (value.endsWith("s")) {
      value = value.slice(0, -1);
      multiplier = 1000;
    }
  }
  if (!isPlainNumber(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n * multiplier;
}

function isPlainNumber(s: string): boolean {
  if (s.length === 0) return false;
  let dotSeen = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 46 /* . */) {
      if (dotSeen) return false;
      dotSeen = true;
    } else if (c < 48 || c > 57) {
      return false;
    }
  }
  return true;
}

/** Round-trip a numeric token value back to canonical text. */
export function formatNumericValue(
  field: NumericField,
  op: ">" | "<" | "between",
  value: number | [number, number],
): string {
  if (op === "between" && Array.isArray(value)) {
    return `${formatScalar(field, value[0])}..${formatScalar(field, value[1])}`;
  }
  if (op === ">") return `>${formatScalar(field, value as number)}`;
  if (op === "<") return `<${formatScalar(field, value as number)}`;
  return String(value);
}

function formatScalar(field: NumericField, n: number): string {
  if (field === "latency") {
    if (n >= 1000 && n % 1000 === 0) return `${n / 1000}s`;
    return `${n}ms`;
  }
  return String(n);
}
