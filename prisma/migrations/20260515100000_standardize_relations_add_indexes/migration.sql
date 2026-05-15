-- Standardize Prisma relations (projectRef → project) and add missing indexes
-- Note: The relation rename (projectRef → project) only changes the Prisma accessor name.
-- The @map("project") on Thread, DashboardLayout, and AgentConfig keeps the DB column unchanged.
-- No column renames are needed — this migration only adds indexes.

-- Add composite index on Message(threadId, createdAt) for efficient thread message queries
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- Add index on RiskItem(assignee) for filtering by assignee
CREATE INDEX "RiskItem_assignee_idx" ON "RiskItem"("assignee");

-- Add index on Incident(createdAt) for time-based queries
CREATE INDEX "Incident_createdAt_idx" ON "Incident"("createdAt");
