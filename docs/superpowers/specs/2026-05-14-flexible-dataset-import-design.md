# Flexible Dataset Import — JSON Support & Unified Normalization

**Date:** 2026-05-14
**Status:** Draft

## Problem

The current import modal only accepts CSV/TSV files. Datasets like `hallucination_50q.json` contain rich structured data (nested objects, numbers, arrays) that can't be imported through the UI. Users must manually convert JSON to CSV before importing.

## Solution

Add JSON file import support to the existing `CSVImportModal`, normalizing all values to `Record<string, string>` so CSV and JSON share the same downstream pipeline.

## Changes

### 1. File Acceptance

- Accept: `.csv`, `.tsv`, `.json`
- Drop zone text: "Drop a CSV or JSON file or click to browse"
- Modal title: "Import File" (instead of "Import CSV")

### 2. JSON Parser (`parseJSON`)

New function alongside existing `parseCSV`:

```
Input:  JSON array of objects (or single object → wrap in array)
Output: { headers: string[], rows: Record<string, string>[] }
```

**Normalization rules:**
| Source type | Conversion | Example |
|---|---|---|
| string | as-is | `"AAPL"` → `"AAPL"` |
| number | `String(v)` | `387.0` → `"387"` |
| boolean | `String(v)` | `true` → `"true"` |
| null/undefined | `""` | `null` → `""` |
| object/array | `JSON.stringify(v)` | `{"answer":"$391.04B"}` → `'{"answer":"$391.04B"}'` |

**Headers:** Union of all keys across all objects (since JSON objects may have varying keys). Order: keys from first object, then any additional keys from subsequent objects.

### 3. Auto-Detection

Existing `autoMapColumns` already matches `"question"` for queryCol — works for JSON fields like `question` without changes.

### 4. Downstream — No Changes

- `onImport` callback signature unchanged
- API routes unchanged (`POST /api/datasets`, `POST /api/datasets/rows`)
- `DatasetRow.data` already stores `Record<string, string>`
- Dataset manager table, edit view, eval template interpolation — all unchanged

### 5. Edge Cases

- Empty array → show error "No data found in file"
- Single object (not array) → wrap in `[obj]`
- Invalid JSON → show parse error message
- Mixed keys across objects → union of all keys, missing fields default to `""`

## Files Modified

| File | Change |
|---|---|
| `components/csv-import-modal.tsx` | Add `parseJSON`, update file accept, update UI text, detect file type by extension |

## Not In Scope

- Nested field flattening (use stringify)
- Re-export to original JSON structure
- DB schema changes
