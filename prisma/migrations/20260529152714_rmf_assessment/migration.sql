-- 금융 AI RMF: 평가 설정(1건) + 보고서 버전 스냅샷
CREATE TABLE "RmfAssessment" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "highImpact" BOOLEAN NOT NULL DEFAULT false,
  "periodFrom" TIMESTAMP(3),
  "periodTo" TIMESTAMP(3),
  "governance" JSONB NOT NULL DEFAULT '{}',
  "controls" JSONB NOT NULL DEFAULT '{}',
  "riskItems" JSONB NOT NULL DEFAULT '{}',
  "assessor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RmfAssessment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RmfAssessment_projectId_key" ON "RmfAssessment"("projectId");
ALTER TABLE "RmfAssessment" ADD CONSTRAINT "RmfAssessment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RmfReportVersion" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "label" TEXT,
  "periodFrom" TIMESTAMP(3),
  "periodTo" TIMESTAMP(3),
  "highImpact" BOOLEAN NOT NULL DEFAULT false,
  "grade" TEXT NOT NULL,
  "total" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "assessor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RmfReportVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RmfReportVersion_projectId_version_key" ON "RmfReportVersion"("projectId","version");
CREATE INDEX "RmfReportVersion_projectId_createdAt_idx" ON "RmfReportVersion"("projectId","createdAt");
ALTER TABLE "RmfReportVersion" ADD CONSTRAINT "RmfReportVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
