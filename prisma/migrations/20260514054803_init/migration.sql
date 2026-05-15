-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "relayKeyHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "langGraphThreadId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '새 대화',
    "project" TEXT NOT NULL DEFAULT 'default',
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageFeedback" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "mitigation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignee" TEXT,
    "dueDate" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "project" TEXT NOT NULL DEFAULT 'default',
    "projectId" TEXT,
    "layout" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalPrompt" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT,
    "evalType" TEXT NOT NULL DEFAULT 'llm_prompt',
    "outputMode" TEXT NOT NULL DEFAULT 'score',
    "template" TEXT NOT NULL DEFAULT '',
    "ruleConfig" TEXT NOT NULL DEFAULT '{}',
    "badgeLabel" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvalPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEvalConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "evalName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "template" TEXT,

    CONSTRAINT "ProjectEvalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "alias" TEXT,
    "templateId" TEXT,
    "agentType" TEXT NOT NULL DEFAULT 'langgraph',
    "endpoint" TEXT NOT NULL DEFAULT 'http://localhost:2024',
    "assistantId" TEXT NOT NULL DEFAULT 'agent',
    "projectId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "agentType" TEXT NOT NULL DEFAULT 'langgraph',
    "endpoint" TEXT NOT NULL DEFAULT 'http://localhost:2024',
    "assistantId" TEXT NOT NULL DEFAULT 'agent',
    "evalPrompts" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmProvider" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "userId" TEXT,
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL DEFAULT '',
    "headers" TEXT NOT NULL DEFAULT '[]',
    "queryCol" TEXT NOT NULL DEFAULT '',
    "contextCol" TEXT NOT NULL DEFAULT '',
    "evalNames" TEXT NOT NULL DEFAULT '[]',
    "evalOverrides" TEXT NOT NULL DEFAULT '{}',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "rows" TEXT NOT NULL DEFAULT '[]',
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetRow" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "DatasetRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetRun" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "agentSource" TEXT NOT NULL DEFAULT '',
    "evalNames" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'running',
    "rowResults" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetRunResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rowIdx" INTEGER NOT NULL,
    "response" TEXT NOT NULL DEFAULT '',
    "query" TEXT NOT NULL DEFAULT '',
    "evals" TEXT NOT NULL DEFAULT '{}',
    "capture" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "DatasetRunResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "traceKeyHash" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL DEFAULT 'langgraph',
    "assistantId" TEXT NOT NULL DEFAULT 'agent',
    "status" TEXT NOT NULL DEFAULT 'online',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageFeedback_messageId_userId_key" ON "MessageFeedback"("messageId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardLayout_userId_project_key" ON "DashboardLayout"("userId", "project");

-- CreateIndex
CREATE UNIQUE INDEX "EvalPrompt_name_projectId_key" ON "EvalPrompt"("name", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectEvalConfig_projectId_evalName_key" ON "ProjectEvalConfig"("projectId", "evalName");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfig_project_key" ON "AgentConfig"("project");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTemplate_userId_name_key" ON "AgentTemplate"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_key_userId_key" ON "AppSettings"("key", "userId");

-- CreateIndex
CREATE INDEX "DatasetRow_datasetId_rowIndex_idx" ON "DatasetRow"("datasetId", "rowIndex");

-- CreateIndex
CREATE INDEX "DatasetRunResult_runId_rowIdx_idx" ON "DatasetRunResult"("runId", "rowIdx");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "ConnectorSession_projectId_status_idx" ON "ConnectorSession"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorSession_userId_projectId_key" ON "ConnectorSession"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageFeedback" ADD CONSTRAINT "MessageFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageFeedback" ADD CONSTRAINT "MessageFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskItem" ADD CONSTRAINT "RiskItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalPrompt" ADD CONSTRAINT "EvalPrompt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEvalConfig" ADD CONSTRAINT "ProjectEvalConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConfig" ADD CONSTRAINT "AgentConfig_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AgentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConfig" ADD CONSTRAINT "AgentConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRow" ADD CONSTRAINT "DatasetRow_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRun" ADD CONSTRAINT "DatasetRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRunResult" ADD CONSTRAINT "DatasetRunResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DatasetRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSession" ADD CONSTRAINT "ConnectorSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSession" ADD CONSTRAINT "ConnectorSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
