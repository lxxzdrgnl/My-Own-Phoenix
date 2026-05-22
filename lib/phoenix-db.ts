// lib/phoenix-db.ts
// Direct postgres connection to Phoenix's traces DB.
// Used for operations that Phoenix's public REST API can't express precisely
// — primarily deleting a single span_annotation by (span_id, name, kind).

import { Pool } from "pg";

const PHOENIX_DB_URL =
  process.env.PHOENIX_DB_URL ?? "postgresql://phoenix:phoenix_dev@localhost:5434/phoenix_traces";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: PHOENIX_DB_URL, max: 5 });
  }
  return pool;
}

/**
 * Delete a single span_annotation row by (span_id, name, annotator_kind).
 *
 * Phoenix's public REST DELETE is project-scoped + time-windowed and can't
 * narrow to one span. We hit postgres directly. Returns the number of rows
 * deleted.
 */
export async function deleteSpanAnnotation(
  spanId: string,
  name: string,
  annotatorKind: "HUMAN" | "LLM" | "CODE",
): Promise<number> {
  const result = await getPool().query(
    `DELETE FROM span_annotations
     WHERE name = $1
       AND annotator_kind = $2
       AND span_rowid IN (SELECT id FROM spans WHERE span_id = $3)`,
    [name, annotatorKind, spanId],
  );
  return result.rowCount ?? 0;
}
