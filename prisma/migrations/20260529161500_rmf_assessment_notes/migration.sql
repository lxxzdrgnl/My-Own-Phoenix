-- RmfAssessment.notes 추가: { highImpactReason?, gaps?: { clauseKey: text } }
ALTER TABLE "RmfAssessment" ADD COLUMN IF NOT EXISTS "notes" JSONB NOT NULL DEFAULT '{}';
