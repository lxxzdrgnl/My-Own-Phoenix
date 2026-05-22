-- Shared dashboard layouts: per-user → per-project
--
-- READ prisma/migrations/20260523000000_shared_dashboard_layout/BACKUP_BEFORE_APPLY.md
-- before applying. This migration deletes rows from DashboardLayout (one row
-- survives per project; Dexter keeps Sean Lee's, others keep the owner's).
--
-- Logic mirrors lib/dashboard-migration.ts which is exercised by
-- scripts/test-dashboard-migration.ts.

-- 1. Add new nullable column for the "last updated by" audit field.
ALTER TABLE "DashboardLayout" ADD COLUMN "lastUpdatedBy" TEXT;

-- 2. Backfill projectId from the legacy `project` (projectName) column.
--    Rows in production were created before projectId existed and have
--    projectId = NULL, using the `project` text column instead.
UPDATE "DashboardLayout" dl
   SET "projectId" = p.id
  FROM "Project" p
 WHERE dl."projectId" IS NULL
   AND p.name = dl.project;

-- 3. Stamp lastUpdatedBy with the original userId of the layout we'll keep.
--    Priority (lower wins):
--      1. project.name = 'dexter' AND user.email = 'yihsean@gmail.com'
--      2. project_member.role = 'owner'
--      3. anything else
WITH ranked AS (
  SELECT
    dl.id,
    dl."projectId",
    dl."userId",
    CASE
      WHEN p.name = 'dexter' AND u.email = 'yihsean@gmail.com' THEN 1
      WHEN pm.role = 'owner' THEN 2
      ELSE 3
    END AS pri
  FROM "DashboardLayout" dl
  JOIN "Project" p ON p.id = dl."projectId"
  JOIN "User" u ON u.id = dl."userId"
  JOIN "ProjectMember" pm
    ON pm."projectId" = dl."projectId" AND pm."userId" = dl."userId"
  WHERE dl."projectId" IS NOT NULL
),
chosen AS (
  SELECT DISTINCT ON ("projectId")
    id, "projectId", "userId"
  FROM ranked
  ORDER BY "projectId", pri, id
)
UPDATE "DashboardLayout" dl
   SET "lastUpdatedBy" = c."userId"
  FROM chosen c
 WHERE dl.id = c.id;

-- 4. Delete every row that wasn't chosen.
--    Anything without a projectId, or whose userId isn't a current project
--    member, also gets dropped (handled by the WHERE in the CTE above).
DELETE FROM "DashboardLayout"
 WHERE id NOT IN (
   SELECT id FROM (
     WITH ranked AS (
       SELECT
         dl.id,
         dl."projectId",
         CASE
           WHEN p.name = 'dexter' AND u.email = 'yihsean@gmail.com' THEN 1
           WHEN pm.role = 'owner' THEN 2
           ELSE 3
         END AS pri
       FROM "DashboardLayout" dl
       JOIN "Project" p ON p.id = dl."projectId"
       JOIN "User" u ON u.id = dl."userId"
       JOIN "ProjectMember" pm
         ON pm."projectId" = dl."projectId" AND pm."userId" = dl."userId"
       WHERE dl."projectId" IS NOT NULL
     )
     SELECT DISTINCT ON ("projectId") id
       FROM ranked
      ORDER BY "projectId", pri, id
   ) keep
 );

-- 5. Schema reshape: drop per-user columns/constraints, make projectId unique
--    and required, add FK for lastUpdatedBy.
ALTER TABLE "DashboardLayout" DROP CONSTRAINT IF EXISTS "DashboardLayout_userId_fkey";
ALTER TABLE "DashboardLayout" DROP CONSTRAINT IF EXISTS "DashboardLayout_userId_project_key";
DROP INDEX IF EXISTS "DashboardLayout_userId_project_key";
ALTER TABLE "DashboardLayout" DROP COLUMN "userId";
ALTER TABLE "DashboardLayout" DROP COLUMN "project";

ALTER TABLE "DashboardLayout" ALTER COLUMN "projectId" SET NOT NULL;
CREATE UNIQUE INDEX "DashboardLayout_projectId_key" ON "DashboardLayout"("projectId");

ALTER TABLE "DashboardLayout"
  ADD CONSTRAINT "DashboardLayout_lastUpdatedBy_fkey"
  FOREIGN KEY ("lastUpdatedBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
