-- DropForeignKey
ALTER TABLE "DashboardLayout" DROP CONSTRAINT "DashboardLayout_userId_fkey";

-- DropForeignKey
ALTER TABLE "MessageFeedback" DROP CONSTRAINT "MessageFeedback_userId_fkey";

-- DropForeignKey
ALTER TABLE "Thread" DROP CONSTRAINT "Thread_userId_fkey";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "phoenixProject" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "AgentConfig_projectId_idx" ON "AgentConfig"("projectId");

-- CreateIndex
CREATE INDEX "Dataset_projectId_idx" ON "Dataset"("projectId");

-- CreateIndex
CREATE INDEX "Incident_projectId_idx" ON "Incident"("projectId");

-- CreateIndex
CREATE INDEX "Message_threadId_idx" ON "Message"("threadId");

-- CreateIndex
CREATE INDEX "RiskItem_projectId_idx" ON "RiskItem"("projectId");

-- CreateIndex
CREATE INDEX "RiskItem_status_idx" ON "RiskItem"("status");

-- CreateIndex
CREATE INDEX "Thread_userId_idx" ON "Thread"("userId");

-- CreateIndex
CREATE INDEX "Thread_projectId_idx" ON "Thread"("projectId");

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageFeedback" ADD CONSTRAINT "MessageFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
