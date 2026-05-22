/**
 * Pure helpers for the GuardrailDetail side-by-side diff.
 *
 * Kept in a separate module from `guardrail-detail.tsx` so they can be
 * imported and tested by Node-only test runners without dragging in
 * React / lucide / "use client".
 */

import type { GuardrailDetection } from "@/lib/phoenix";

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Build a list of segments for highlighting masked ranges in a string.
 * Out-of-range / overlapping detections are clamped / merged so callers
 * never crash on bad input.
 */
export function buildHighlightSegments(
  source: string,
  ranges: ReadonlyArray<{ start: number; end: number }>,
): HighlightSegment[] {
  if (!source) return [];
  if (!ranges.length) return [{ text: source, highlighted: false }];

  // Normalize + sort + clamp + drop invalid
  const sorted = ranges
    .map((r) => ({
      start: Math.max(0, Math.min(source.length, Math.floor(r.start))),
      end: Math.max(0, Math.min(source.length, Math.floor(r.end))),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  // Merge overlaps so segments are clean
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  const out: HighlightSegment[] = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.start > cursor) {
      out.push({ text: source.slice(cursor, r.start), highlighted: false });
    }
    out.push({ text: source.slice(r.start, r.end), highlighted: true });
    cursor = r.end;
  }
  if (cursor < source.length) {
    out.push({ text: source.slice(cursor), highlighted: false });
  }
  return out;
}

/**
 * Find the positions of each detection's `masked` placeholder in the
 * masked output string, returning ranges suitable for highlighting.
 * Uses simple `indexOf` per masked token, advancing the cursor so the
 * same placeholder string repeated twice highlights both occurrences.
 */
export function locateMaskedRanges(
  masked: string,
  detections: ReadonlyArray<GuardrailDetection>,
): Array<{ start: number; end: number }> {
  if (!masked) return [];
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const d of detections) {
    if (!d.masked) continue;
    const idx = masked.indexOf(d.masked, cursor);
    if (idx === -1) continue;
    ranges.push({ start: idx, end: idx + d.masked.length });
    cursor = idx + d.masked.length;
  }
  return ranges;
}
