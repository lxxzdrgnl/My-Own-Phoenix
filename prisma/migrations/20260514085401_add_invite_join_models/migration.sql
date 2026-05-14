-- CreateTable
CREATE TABLE "ProjectInviteCode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "maxUses" INTEGER NOT NULL DEFAULT 0,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectInviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectJoinRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInviteCode_code_key" ON "ProjectInviteCode"("code");

-- CreateIndex
CREATE INDEX "ProjectInviteCode_projectId_idx" ON "ProjectInviteCode"("projectId");

-- CreateIndex
CREATE INDEX "ProjectJoinRequest_projectId_status_idx" ON "ProjectJoinRequest"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectJoinRequest_projectId_userId_key" ON "ProjectJoinRequest"("projectId", "userId");

-- AddForeignKey
ALTER TABLE "ProjectInviteCode" ADD CONSTRAINT "ProjectInviteCode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectJoinRequest" ADD CONSTRAINT "ProjectJoinRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectJoinRequest" ADD CONSTRAINT "ProjectJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectJoinRequest" ADD CONSTRAINT "ProjectJoinRequest_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "ProjectInviteCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
