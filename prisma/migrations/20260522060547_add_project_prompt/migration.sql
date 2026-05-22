-- CreateTable
CREATE TABLE "ProjectPrompt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phoenixName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectPrompt_projectId_idx" ON "ProjectPrompt"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPrompt_phoenixName_key" ON "ProjectPrompt"("phoenixName");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPrompt_projectId_phoenixName_key" ON "ProjectPrompt"("projectId", "phoenixName");

-- AddForeignKey
ALTER TABLE "ProjectPrompt" ADD CONSTRAINT "ProjectPrompt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
