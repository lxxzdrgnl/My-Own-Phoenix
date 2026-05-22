-- Per-project PII guard run history. Previously the past-runs / dashboard tabs
-- fetched a static benchmark JSON from /public, so every project saw the same
-- data. New rows are project-scoped and a separate seed step backfills the
-- existing 100-sample benchmark into the dexter project.

CREATE TABLE "PiiGuardRun" (
  "id"             TEXT PRIMARY KEY,
  "projectId"      TEXT NOT NULL,
  "externalId"     TEXT NOT NULL DEFAULT '',
  "category"       TEXT NOT NULL DEFAULT '',
  "input"          TEXT NOT NULL,
  "expectedMasked" TEXT NOT NULL DEFAULT '',
  "actualMasked"   TEXT NOT NULL DEFAULT '',
  "detections"     TEXT NOT NULL DEFAULT '{}',
  "outcome"        TEXT NOT NULL,
  "latencyMs"      INTEGER NOT NULL DEFAULT 0,
  "outputGuard"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PiiGuardRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX "PiiGuardRun_projectId_createdAt_idx" ON "PiiGuardRun"("projectId", "createdAt");
