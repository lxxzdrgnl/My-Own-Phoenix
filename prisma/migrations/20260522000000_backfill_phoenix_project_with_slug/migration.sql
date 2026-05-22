-- Backfill Project.phoenixProject with slug for rows where it was left as the default empty string.
-- New projects now set phoenixProject = slug at creation time (see app/api/projects/route.ts).
-- Without this, the evaluations page would fall back to listing every Phoenix project on the backend.

UPDATE "Project" SET "phoenixProject" = "slug" WHERE "phoenixProject" = '';
